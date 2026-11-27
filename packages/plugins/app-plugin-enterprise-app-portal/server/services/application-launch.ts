import { portalError } from '../errors.js';
import type { AccessIdentity } from './casdoor-application-access.js';
import type { ApplicationCatalogService } from './application-catalog.js';
import type { CasdoorApplicationAccessAdapter } from './casdoor-application-access.js';
import type { AccessAuditLog } from './access-audit.js';
import type { HealthProbeService } from './health-probe.js';
import type { UserPreferenceService } from './user-preferences.js';
import type { AutoLaunchMode } from '../config.js';
import { assertPublicHttpsUrl, type DnsLookup } from './url-guard.js';

export interface LaunchResult {
  readonly appCode: string;
  readonly name: string;
  readonly url: string;
}

export interface AuthorizedApplicationView {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly businessCenter: string | null;
  readonly description: string | null;
  readonly icon: string | null;
  readonly enabled: boolean;
  readonly health: 'healthy' | 'unhealthy' | 'unknown';
  readonly isDefault: boolean;
}

export class ApplicationLaunchService {
  constructor(
    private readonly catalog: ApplicationCatalogService,
    private readonly access: CasdoorApplicationAccessAdapter,
    private readonly health: HealthProbeService,
    private readonly preferences: UserPreferenceService,
    private readonly audit: AccessAuditLog,
    private readonly allowlist: () => readonly string[],
    private readonly lookup: DnsLookup | undefined = undefined,
    private readonly launchUrlOptions: () => {
      readonly allowHttp?: boolean;
      readonly allowPrivateDns?: boolean;
    } = () => ({}),
  ) {}

  public async listAuthorized(
    identity: AccessIdentity,
    options: { readonly requireBinding?: boolean } = {},
  ): Promise<{
    readonly applications: readonly AuthorizedApplicationView[];
    readonly autoLaunchMode: AutoLaunchMode;
    readonly suggestedAppCode: string | null;
    readonly isolationNotice: boolean;
  }> {
    const decision = await this.access.listAuthorizedAppKeys(identity, {
      requireBinding: options.requireBinding,
    });
    const catalog = await this.catalog.list();
    const authorized = catalog.filter(
      (record) => record.enabled && decision.appKeys.includes(record.appCode),
    );
    const health = await this.health.probeMany(authorized);
    const prefs = await this.preferences.get(identity.userId);
    const suggested = suggestAutoLaunch(
      prefs.autoLaunchMode,
      authorized,
      prefs.defaultAppCode,
    );
    return {
      applications: authorized.map((record) => ({
        appCode: record.appCode,
        name: record.name,
        appType: record.appType,
        businessCenter: record.businessCenter,
        description: record.description,
        icon: record.icon,
        enabled: record.enabled,
        health:
          health.find((entry) => entry.appCode === record.appCode)?.status ??
          'unknown',
        isDefault: record.appCode === prefs.defaultAppCode,
      })),
      autoLaunchMode: prefs.autoLaunchMode,
      suggestedAppCode: suggested,
      isolationNotice: decision.source === 'contractFixture',
    };
  }

  /**
   * Octop apps eligible for unified Router Ticket entry.
   * `agentGrantsEnabled` is intentionally ignored as an entry gate.
   */
  public async listRoutingCandidates(
    identity: AccessIdentity,
    options: { readonly requireBinding?: boolean } = {},
  ): Promise<{
    readonly applications: readonly AuthorizedApplicationView[];
    readonly autoLaunchMode: AutoLaunchMode;
    readonly suggestedAppCode: string | null;
  }> {
    const listed = await this.listAuthorized(identity, options);
    const prefs = await this.preferences.get(identity.userId);
    const catalog = await this.catalog.list();
    const byCode = new Map(catalog.map((record) => [record.appCode, record]));
    const applications = listed.applications.filter((app) => {
      if (app.appType !== 'octop' || !app.enabled) return false;
      const record = byCode.get(app.appCode);
      if (!record || !(record.casdoorAppKey ?? '').trim()) return false;
      try {
        const url = this.catalog.launchUrlOf(record);
        const host = new URL(url).hostname.toLowerCase();
        return this.allowlist().some(
          (entry) => entry.trim().toLowerCase() === host,
        );
      } catch {
        return false;
      }
    });
    return {
      applications,
      autoLaunchMode: listed.autoLaunchMode,
      suggestedAppCode: suggestAutoLaunch(
        prefs.autoLaunchMode,
        applications,
        prefs.defaultAppCode,
      ),
    };
  }

  public async launch(
    identity: AccessIdentity,
    appCode: string,
    options: {
      readonly bypassCache?: boolean;
      readonly requireBinding?: boolean;
    } = {},
  ): Promise<LaunchResult> {
    const record = await this.catalog.requireByCode(appCode);
    if (!record.enabled) {
      await this.audit.record({
        actorUserId: identity.userId,
        appCode,
        action: 'launch',
        result: 'denied',
        reason: 'APP_DISABLED',
      });
      throw portalError(
        'FAILED_PRECONDITION',
        'APP_DISABLED',
        'The application is disabled.',
      );
    }
    try {
      await this.access.assertAuthorized(identity, appCode, options);
    } catch (error) {
      await this.audit.record({
        actorUserId: identity.userId,
        appCode,
        action: 'launch',
        result: 'denied',
        reason:
          error instanceof Error && 'reason' in error
            ? String((error as { reason: string }).reason)
            : 'APP_ACCESS_DENIED',
      });
      throw error;
    }
    const probe = await this.health.probe(record);
    if (probe.status === 'unhealthy') {
      await this.audit.record({
        actorUserId: identity.userId,
        appCode,
        action: 'launch',
        result: 'unavailable',
        reason: 'APP_UNHEALTHY',
      });
      throw portalError(
        'FAILED_PRECONDITION',
        'APP_UNHEALTHY',
        'The application health check failed; refusing to launch.',
      );
    }
    const url = this.catalog.launchUrlOf(record);
    const launchOpts = this.launchUrlOptions();
    await assertPublicHttpsUrl(url, this.allowlist(), {
      ...(this.lookup ? { lookup: this.lookup } : {}),
      allowHttp: launchOpts.allowHttp,
      allowPrivateDns: launchOpts.allowPrivateDns,
    });
    await this.audit.record({
      actorUserId: identity.userId,
      appCode,
      action: 'launch',
      result: 'success',
    });
    return { appCode: record.appCode, name: record.name, url };
  }
}

function suggestAutoLaunch(
  mode: AutoLaunchMode,
  authorized: readonly { readonly appCode: string }[],
  defaultAppCode: string | null,
): string | null {
  const defaultValid =
    defaultAppCode != null &&
    authorized.some((record) => record.appCode === defaultAppCode);
  if (mode === 'if_single' && authorized.length === 1) {
    return authorized[0].appCode;
  }
  if (mode === 'default_if_valid' && defaultValid) {
    return defaultAppCode;
  }
  return null;
}
