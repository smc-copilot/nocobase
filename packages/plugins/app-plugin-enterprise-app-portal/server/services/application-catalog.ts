import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import type { OctopApiAuthMode, PortalAppType } from '../config.js';
import { APP_TYPES } from '../config.js';
import { portalError } from '../errors.js';
import {
  assertOctopApiBaseUrl,
  formatOctopApiBaseUrl,
  type OctopUrlGuardOptions,
} from './octop-url-guard.js';
import {
  assertPublicHttpsUrl,
  composeLaunchUrl,
  parseRelativeTargetPath,
  type DnsLookup,
} from './url-guard.js';
import type { AccessAuditLog } from './access-audit.js';
import { str, strOrNull, toBool, toDate } from './values.js';

export interface PortalApplicationInput {
  readonly appCode: string;
  readonly name: string;
  readonly appType: PortalAppType;
  readonly businessCenter?: string | null;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly baseUrl: string;
  readonly targetPath?: string;
  readonly healthUrl?: string | null;
  readonly casdoorAppKey?: string | null;
  readonly enabled?: boolean;
  readonly sortOrder?: number;
  readonly agentGrantsEnabled?: boolean;
  readonly supportsInstallAsUser?: boolean;
  readonly apiBaseUrl?: string | null;
  readonly apiAuthMode?: OctopApiAuthMode | null;
  readonly apiTokenEnv?: string | null;
  readonly apiUsernameEnv?: string | null;
  readonly apiPasswordEnv?: string | null;
}

export type PortalApplicationPatch = Partial<
  Omit<PortalApplicationInput, 'appCode'>
>;

export interface PortalApplicationRecord {
  readonly id: string;
  readonly appCode: string;
  readonly name: string;
  readonly appType: PortalAppType;
  readonly businessCenter: string | null;
  readonly description: string | null;
  readonly icon: string | null;
  readonly baseUrl: string;
  readonly targetPath: string;
  readonly healthUrl: string | null;
  readonly casdoorAppKey: string | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly agentGrantsEnabled: boolean;
  readonly supportsInstallAsUser: boolean;
  readonly apiBaseUrl: string | null;
  readonly apiAuthMode: string | null;
  readonly apiTokenEnv: string | null;
  readonly apiUsernameEnv: string | null;
  readonly apiPasswordEnv: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function asType(value: unknown): PortalAppType {
  const text = String(value);
  if ((APP_TYPES as readonly string[]).includes(text)) {
    return text as PortalAppType;
  }
  return 'https';
}

function toRecord(row: Record<string, unknown>): PortalApplicationRecord {
  return {
    id: str(row.id),
    appCode: str(row.appCode),
    name: str(row.name),
    appType: asType(row.appType),
    businessCenter: strOrNull(row.businessCenter),
    description: strOrNull(row.description),
    icon: strOrNull(row.icon),
    baseUrl: str(row.baseUrl),
    targetPath: str(row.targetPath) || '/',
    healthUrl: strOrNull(row.healthUrl),
    casdoorAppKey: strOrNull(row.casdoorAppKey),
    enabled: toBool(row.enabled),
    sortOrder: Number(row.sortOrder ?? 0),
    agentGrantsEnabled: toBool(row.agentGrantsEnabled),
    supportsInstallAsUser: toBool(row.supportsInstallAsUser),
    apiBaseUrl: blankToNull(row.apiBaseUrl),
    apiAuthMode: blankToNull(row.apiAuthMode),
    apiTokenEnv: blankToNull(row.apiTokenEnv),
    apiUsernameEnv: blankToNull(row.apiUsernameEnv),
    apiPasswordEnv: blankToNull(row.apiPasswordEnv),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function blankToNull(value: unknown): string | null {
  const text = strOrNull(value);
  return text && text.trim() ? text : null;
}

export class ApplicationCatalogService {
  constructor(
    private readonly database: () => DatabaseManager,
    private readonly allowlist: () => readonly string[],
    private readonly audit: AccessAuditLog,
    private readonly lookup: DnsLookup | undefined = undefined,
    private readonly launchUrlOptions: () => {
      readonly allowHttp?: boolean;
      readonly allowPrivateDns?: boolean;
    } = () => ({}),
    private readonly octopAllowlist: () => readonly string[] = () => [],
    private readonly octopUrlOptions: () => OctopUrlGuardOptions = () => ({}),
  ) {}

  public async list(): Promise<readonly PortalApplicationRecord[]> {
    const rows = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalApplications')
      .selectAll()
      .orderBy('sortOrder', 'asc')
      .orderBy('appCode', 'asc')
      .execute();
    return rows.map((row: Record<string, unknown>) => toRecord(row));
  }

  public async getByCode(
    appCode: string,
  ): Promise<PortalApplicationRecord | undefined> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalApplications')
      .selectAll()
      .where('appCode', '=', appCode)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  public async requireByCode(
    appCode: string,
  ): Promise<PortalApplicationRecord> {
    const record = await this.getByCode(appCode);
    if (!record) {
      throw portalError('NOT_FOUND', 'APP_NOT_FOUND', 'Unknown application.');
    }
    return record;
  }

  public launchUrlOf(record: PortalApplicationRecord): string {
    return composeLaunchUrl(record.baseUrl, record.targetPath);
  }

  public async create(
    input: PortalApplicationInput,
    actorId: string | null,
  ): Promise<PortalApplicationRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(input.appCode)) {
      throw portalError(
        'INVALID_ARGUMENT',
        'INVALID_APP_CODE',
        'appCode must start with a letter or digit.',
      );
    }
    if (input.appCode === 'admin') {
      throw portalError(
        'INVALID_ARGUMENT',
        'RESERVED_APP_CODE',
        'appCode "admin" is reserved.',
      );
    }
    const apiBaseUrl = await this.normalizeApiBaseUrl(input.apiBaseUrl);
    await this.validateUrls(input);
    if (await this.getByCode(input.appCode)) {
      throw portalError(
        'ALREADY_EXISTS',
        'APP_CODE_EXISTS',
        'appCode must be unique.',
      );
    }
    const now = new Date();
    const id = randomUUID();
    await this.database()
      .connection()
      .query.insertInto('enterprisePortalApplications')
      .values({
        id,
        appCode: input.appCode,
        name: input.name,
        appType: input.appType,
        businessCenter: input.businessCenter ?? null,
        description: input.description ?? null,
        icon: input.icon ?? null,
        baseUrl: new URL(input.baseUrl).toString(),
        targetPath: parseRelativeTargetPath(input.targetPath),
        healthUrl: input.healthUrl ? new URL(input.healthUrl).toString() : null,
        casdoorAppKey: input.casdoorAppKey ?? null,
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? 0,
        agentGrantsEnabled: input.agentGrantsEnabled ?? false,
        supportsInstallAsUser: input.supportsInstallAsUser ?? false,
        apiBaseUrl,
        apiAuthMode: input.apiAuthMode ?? null,
        apiTokenEnv: input.apiTokenEnv ?? null,
        apiUsernameEnv: input.apiUsernameEnv ?? null,
        apiPasswordEnv: input.apiPasswordEnv ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await this.audit.record({
      actorUserId: actorId,
      appCode: input.appCode,
      action: 'catalog.create',
      result: 'success',
    });
    return (await this.getByCode(input.appCode))!;
  }

  public async update(
    appCode: string,
    patch: PortalApplicationPatch,
    actorId: string | null,
  ): Promise<PortalApplicationRecord> {
    const current = await this.requireByCode(appCode);
    const apiBaseUrl = await this.normalizeApiBaseUrl(
      patch.apiBaseUrl === undefined ? current.apiBaseUrl : patch.apiBaseUrl,
    );
    const next = {
      ...current,
      ...patch,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      targetPath: patch.targetPath ?? current.targetPath,
      healthUrl:
        patch.healthUrl === undefined ? current.healthUrl : patch.healthUrl,
      apiBaseUrl,
    };
    await this.validateUrls(next);
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalApplications')
      .set({
        name: next.name,
        appType: next.appType,
        businessCenter: next.businessCenter,
        description: next.description,
        icon: next.icon,
        baseUrl: new URL(next.baseUrl).toString(),
        targetPath: parseRelativeTargetPath(next.targetPath),
        healthUrl: next.healthUrl ? new URL(next.healthUrl).toString() : null,
        casdoorAppKey: next.casdoorAppKey,
        enabled: next.enabled,
        sortOrder: next.sortOrder,
        agentGrantsEnabled: next.agentGrantsEnabled,
        supportsInstallAsUser: next.supportsInstallAsUser,
        apiBaseUrl: next.apiBaseUrl,
        apiAuthMode: next.apiAuthMode,
        apiTokenEnv: next.apiTokenEnv,
        apiUsernameEnv: next.apiUsernameEnv,
        apiPasswordEnv: next.apiPasswordEnv,
        updatedAt: new Date(),
      })
      .where('appCode', '=', appCode)
      .execute();
    await this.audit.record({
      actorUserId: actorId,
      appCode,
      action: 'catalog.update',
      result: 'success',
    });
    return (await this.getByCode(appCode))!;
  }

  private async validateUrls(input: {
    readonly baseUrl: string;
    readonly targetPath?: string;
    readonly healthUrl?: string | null;
  }): Promise<void> {
    parseRelativeTargetPath(input.targetPath);
    const launchOpts = this.launchUrlOptions();
    const guard = {
      ...(this.lookup ? { lookup: this.lookup } : {}),
      allowHttp: launchOpts.allowHttp,
      allowPrivateDns: launchOpts.allowPrivateDns,
    };
    await assertPublicHttpsUrl(input.baseUrl, this.allowlist(), guard);
    if (input.healthUrl) {
      await assertPublicHttpsUrl(input.healthUrl, this.allowlist(), guard);
    }
  }

  /**
   * Management API URLs use the Octop allowlist, not the employee launch guard.
   */
  private async normalizeApiBaseUrl(
    raw: string | null | undefined,
  ): Promise<string | null> {
    if (!raw || !raw.trim()) return null;
    const url = await assertOctopApiBaseUrl(raw, this.octopAllowlist(), {
      ...this.octopUrlOptions(),
      ...(this.lookup ? { lookup: this.lookup } : {}),
    });
    return formatOctopApiBaseUrl(url);
  }
}
