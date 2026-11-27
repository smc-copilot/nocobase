import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type { SecretsService } from '@nocobase/app-server/secrets';
import type { DatabaseConnection } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import type { MeetingGatewayConfig } from '../../config/meeting-gateway.js';
import { requireMeetingAction, requireUser, toIso } from '../access.js';
import {
  GATEWAY_CLIENT_SECRET_PURPOSE,
  MEETING_GATEWAY_BINDINGS,
  MEETING_GATEWAY_SETTINGS,
  MEETING_OAUTH_STATES,
  type MeetingGatewayBinding,
  type MeetingGatewaySettings,
  type MeetingOauthState,
} from '../resources.js';
import { resolveConfiguredOrigin, validateHttpsOrigin } from './origin.js';
import { gatewaySettingsAad } from './secrets.js';

const TOKEN_ID = /^[A-Za-z0-9_-]{1,128}$/;
const INSTANCE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SETTINGS_ID = 'default';

export type GatewayFieldSource = 'settings' | 'env' | 'none';

export interface GatewaySettingsPublic {
  origin: string | null;
  applicationId: string | null;
  expectedApplicationId: string | null;
  clientId: string | null;
  resource: string | null;
  scopes: string[];
  publicBaseUrl: string | null;
  tencentCorpId: string | null;
  tencentSdkId: string | null;
  callbackRef: string | null;
  instanceId: string | null;
  hasSecret: boolean;
  credentialVersion: number;
  sources: {
    origin: GatewayFieldSource;
    applicationId: GatewayFieldSource;
    expectedApplicationId: GatewayFieldSource;
    clientId: GatewayFieldSource;
    resource: GatewayFieldSource;
    scopes: GatewayFieldSource;
    publicBaseUrl: GatewayFieldSource;
    tencentCorpId: GatewayFieldSource;
    tencentSdkId: GatewayFieldSource;
    callbackRef: GatewayFieldSource;
    instanceId: GatewayFieldSource;
    clientSecret: GatewayFieldSource;
  };
  runtime: {
    origin: string | null;
    applicationId: string | null;
    clientId: string | null;
    instanceId: string;
    configured: boolean;
  };
  deployment: {
    originAllowlist: string[];
    authorizationPathAllowlist: string[];
    testAdapter: boolean;
    adapterKind: 'http' | 'test';
    identityIssuance: 'unavailable' | 'test-adapter';
    queryHttpContract: 'unavailable';
    liveVerified: false;
    testAdapterRequiresRestart: true;
    originHotReload: true;
  };
  savedDoesNotVerify: true;
  saveDoesNotBind: true;
  updatedAt: string | null;
}

export interface ResolvedMeetingGatewayConfig extends MeetingGatewayConfig {
  readonly sources: GatewaySettingsPublic['sources'];
  readonly hasSecret: boolean;
  readonly settingsCredentialVersion: number;
}

export interface GatewaySettingsSaveInput {
  origin?: string | null;
  applicationId?: string | null;
  expectedApplicationId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  resource?: string | null;
  scopes?: string[] | string | null;
  publicBaseUrl?: string | null;
  tencentCorpId?: string | null;
  tencentSdkId?: string | null;
  callbackRef?: string | null;
  instanceId?: string | null;
}

function keep(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  if (incoming === undefined) return existing ?? null;
  if (incoming === null) return null;
  const trimmed = incoming.trim();
  return trimmed || null;
}

function pick(
  saved: string | null | undefined,
  env: string | undefined,
): { value: string | undefined; source: GatewayFieldSource } {
  if (saved?.trim()) return { value: saved.trim(), source: 'settings' };
  if (env?.trim()) return { value: env.trim(), source: 'env' };
  return { value: undefined, source: 'none' };
}

function asScopeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function keepScopes(
  incoming: string[] | string | null | undefined,
  existing: string[] | null | undefined,
): string[] | null {
  if (incoming === undefined) return existing?.length ? existing : null;
  if (incoming === null) return null;
  const next = asScopeList(incoming);
  return next.length ? next : null;
}

function invalid(field: string, description: string): never {
  throw new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'INVALID_INPUT',
    domain: 'meetings',
    message: description,
    fieldViolations: [{ field, description }],
  });
}

function validateToken(field: string, value: string | null): string | null {
  if (!value) return null;
  if (!TOKEN_ID.test(value)) {
    invalid(
      field,
      `${field} must be 1–128 letters, digits, underscores or hyphens.`,
    );
  }
  return value;
}

function validateInstanceId(value: string | null): string | null {
  if (!value) return null;
  if (!INSTANCE_ID.test(value)) {
    invalid(
      'instanceId',
      'instanceId must be 1–64 letters, digits, dots, underscores or hyphens.',
    );
  }
  return value;
}

function validatePublicBaseUrl(value: string | null): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid(
      'publicBaseUrl',
      'publicBaseUrl must be an http(s) origin without credentials or a path.',
    );
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    invalid(
      'publicBaseUrl',
      'publicBaseUrl must be an http(s) origin without credentials or a path.',
    );
  }
  return parsed.origin;
}

function validateSavedOrigin(
  origin: string | null,
  originAllowlist: readonly string[],
): string | null {
  if (!origin) return null;
  try {
    validateHttpsOrigin(origin);
  } catch {
    invalid(
      'origin',
      'Gateway origin must be an HTTPS origin without credentials, a path, or an unsafe host. TLS verification cannot be disabled.',
    );
  }
  try {
    return resolveConfiguredOrigin(origin, originAllowlist);
  } catch {
    invalid(
      'origin',
      'Gateway origin must already be listed in the deployment originAllowlist. Saving an origin does not expand that allowlist.',
    );
  }
}

export function resolveMeetingGatewayRuntime(input: {
  row: MeetingGatewaySettings | undefined;
  secrets: SecretsService;
  deployment: MeetingGatewayConfig;
}): ResolvedMeetingGatewayConfig {
  const { row, secrets, deployment } = input;
  const origin = pick(row?.origin, deployment.origin);
  const applicationId = pick(row?.applicationId, deployment.applicationId);
  const expectedApplicationId = pick(
    row?.expectedApplicationId,
    deployment.expectedApplicationId,
  );
  const clientId = pick(row?.clientId, deployment.clientId);
  const resource = pick(row?.resource, deployment.resource);
  const savedScopes = asScopeList(row?.scopes);
  const scopes = savedScopes.length
    ? savedScopes
    : [...(deployment.scopes ?? [])];
  const scopesSource: GatewayFieldSource = savedScopes.length
    ? 'settings'
    : deployment.scopes?.length
      ? 'env'
      : 'none';
  const publicBaseUrl = pick(row?.publicBaseUrl, deployment.publicBaseUrl);
  const tencentCorpId = pick(row?.tencentCorpId, deployment.tencentCorpId);
  const tencentSdkId = pick(row?.tencentSdkId, deployment.tencentSdkId);
  const callbackRef = pick(row?.callbackRef, deployment.callbackRef);
  const instanceId = pick(row?.instanceId, deployment.instanceId);
  let clientSecret: string | undefined;
  let secretSource: GatewayFieldSource = 'none';
  if (row?.sealedClientSecret && secrets.ready) {
    try {
      clientSecret = secrets.open(row.sealedClientSecret, {
        purpose: GATEWAY_CLIENT_SECRET_PURPOSE,
        aad: gatewaySettingsAad({
          id: row.id,
          credentialVersion: row.credentialVersion,
        }),
      });
      secretSource = 'settings';
    } catch {
      secretSource = 'settings';
    }
  }
  if (!clientSecret && deployment.clientSecret) {
    clientSecret = deployment.clientSecret;
    secretSource = secretSource === 'settings' ? 'settings' : 'env';
  }
  return {
    origin: origin.value,
    originAllowlist: deployment.originAllowlist,
    applicationId: applicationId.value,
    expectedApplicationId: expectedApplicationId.value,
    clientId: clientId.value,
    clientSecret,
    resource: resource.value,
    scopes,
    publicBaseUrl: publicBaseUrl.value,
    tencentCorpId: tencentCorpId.value,
    tencentSdkId: tencentSdkId.value,
    callbackRef: callbackRef.value,
    authorizationPathAllowlist: deployment.authorizationPathAllowlist,
    timeoutMs: deployment.timeoutMs,
    queryMaxDays: deployment.queryMaxDays,
    oauthStateTtlMs: deployment.oauthStateTtlMs,
    instanceId: instanceId.value,
    testAdapter: deployment.testAdapter === true,
    sources: {
      origin: origin.source,
      applicationId: applicationId.source,
      expectedApplicationId: expectedApplicationId.source,
      clientId: clientId.source,
      resource: resource.source,
      scopes: scopesSource,
      publicBaseUrl: publicBaseUrl.source,
      tencentCorpId: tencentCorpId.source,
      tencentSdkId: tencentSdkId.source,
      callbackRef: callbackRef.source,
      instanceId: instanceId.source,
      clientSecret: secretSource,
    },
    hasSecret: Boolean(row?.sealedClientSecret || deployment.clientSecret),
    settingsCredentialVersion: row?.credentialVersion ?? 0,
  };
}

export async function loadMeetingGatewaySettingsRow(
  connection: DatabaseConnection,
): Promise<MeetingGatewaySettings | undefined> {
  return connection
    .repository<MeetingGatewaySettings>(MEETING_GATEWAY_SETTINGS)
    .findOne({ filter: { id: SETTINGS_ID } });
}

export async function loadMeetingGatewayRuntime(input: {
  connection: DatabaseConnection;
  secrets: SecretsService;
  deployment: MeetingGatewayConfig;
}): Promise<ResolvedMeetingGatewayConfig> {
  const row = await loadMeetingGatewaySettingsRow(input.connection);
  return resolveMeetingGatewayRuntime({
    row,
    secrets: input.secrets,
    deployment: input.deployment,
  });
}

function runtimeIdentity(runtime: ResolvedMeetingGatewayConfig): string {
  return JSON.stringify({
    origin: runtime.origin ?? null,
    applicationId: runtime.applicationId ?? null,
    expectedApplicationId: runtime.expectedApplicationId ?? null,
    clientId: runtime.clientId ?? null,
    instanceId: runtime.instanceId || 'default',
  });
}

function previewSettingsRow(
  existing: MeetingGatewaySettings | undefined,
  values: Partial<MeetingGatewaySettings>,
): MeetingGatewaySettings {
  const now = values.updatedAt ?? existing?.updatedAt ?? new Date();
  return {
    id: existing?.id ?? SETTINGS_ID,
    origin: values.origin ?? null,
    applicationId: values.applicationId ?? null,
    expectedApplicationId: values.expectedApplicationId ?? null,
    clientId: values.clientId ?? null,
    sealedClientSecret:
      values.sealedClientSecret === undefined
        ? (existing?.sealedClientSecret ?? null)
        : values.sealedClientSecret,
    credentialVersion:
      values.credentialVersion ?? existing?.credentialVersion ?? 1,
    resource: values.resource ?? null,
    scopes: values.scopes ?? null,
    publicBaseUrl: values.publicBaseUrl ?? null,
    tencentCorpId: values.tencentCorpId ?? null,
    tencentSdkId: values.tencentSdkId ?? null,
    callbackRef: values.callbackRef ?? null,
    instanceId: values.instanceId ?? null,
    updatedBy: values.updatedBy ?? existing?.updatedBy ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export class MeetingGatewaySettingsService {
  private runtimeCache: Promise<ResolvedMeetingGatewayConfig> | undefined;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly secrets: SecretsService,
    private readonly deployment: MeetingGatewayConfig,
    private readonly userId: string | undefined,
  ) {}

  async resolveRuntime(): Promise<ResolvedMeetingGatewayConfig> {
    this.runtimeCache ??= loadMeetingGatewayRuntime({
      connection: this.connection,
      secrets: this.secrets,
      deployment: this.deployment,
    });
    return this.runtimeCache;
  }

  private invalidateRuntime(): void {
    this.runtimeCache = undefined;
  }

  async get(): Promise<GatewaySettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    const row = await loadMeetingGatewaySettingsRow(this.connection);
    return this.publicRow(row);
  }

  async save(input: GatewaySettingsSaveInput): Promise<GatewaySettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    const actor = requireUser(this.userId);
    const now = new Date();
    const existing = await loadMeetingGatewaySettingsRow(this.connection);
    const origin = validateSavedOrigin(
      keep(input.origin, existing?.origin),
      this.deployment.originAllowlist,
    );
    const applicationId = validateToken(
      'applicationId',
      keep(input.applicationId, existing?.applicationId),
    );
    const expectedApplicationId = validateToken(
      'expectedApplicationId',
      keep(input.expectedApplicationId, existing?.expectedApplicationId),
    );
    const clientId = validateToken(
      'clientId',
      keep(input.clientId, existing?.clientId),
    );
    const resource = keep(input.resource, existing?.resource);
    const scopes = keepScopes(input.scopes, existing?.scopes);
    const publicBaseUrl = validatePublicBaseUrl(
      keep(input.publicBaseUrl, existing?.publicBaseUrl),
    );
    const tencentCorpId = validateToken(
      'tencentCorpId',
      keep(input.tencentCorpId, existing?.tencentCorpId),
    );
    const tencentSdkId = validateToken(
      'tencentSdkId',
      keep(input.tencentSdkId, existing?.tencentSdkId),
    );
    const callbackRef = validateToken(
      'callbackRef',
      keep(input.callbackRef, existing?.callbackRef),
    );
    const instanceId = validateInstanceId(
      keep(input.instanceId, existing?.instanceId),
    );
    if (
      expectedApplicationId &&
      applicationId &&
      expectedApplicationId !== applicationId
    ) {
      invalid(
        'expectedApplicationId',
        'expectedApplicationId must equal applicationId when both are set.',
      );
    }

    const secretIncoming = input.clientSecret;
    const clearSecret = secretIncoming === null;
    const nextSecret =
      typeof secretIncoming === 'string' ? secretIncoming.trim() : '';
    const replaceSecret = nextSecret.length > 0;
    const secretMutated = replaceSecret || clearSecret;
    let nextVersion = existing?.credentialVersion ?? 1;
    let sealedClientSecret = existing?.sealedClientSecret ?? null;
    if (clearSecret) {
      sealedClientSecret = null;
      nextVersion = (existing?.credentialVersion ?? 0) + 1;
    } else if (replaceSecret) {
      if (!this.secrets.ready) {
        throw new ApiError({
          status: 'FAILED_PRECONDITION',
          reason: 'GATEWAY_NOT_CONFIGURED',
          domain: 'meetings',
          message:
            'Secrets are not configured, so the gateway client secret cannot be sealed.',
        });
      }
      nextVersion = (existing?.credentialVersion ?? 0) + 1;
      sealedClientSecret = this.secrets.seal(nextSecret, {
        purpose: GATEWAY_CLIENT_SECRET_PURPOSE,
        aad: gatewaySettingsAad({
          id: SETTINGS_ID,
          credentialVersion: nextVersion,
        }),
      });
    }

    const previousRuntime = resolveMeetingGatewayRuntime({
      row: existing,
      secrets: this.secrets,
      deployment: this.deployment,
    });
    const nextRuntime = resolveMeetingGatewayRuntime({
      row: previewSettingsRow(existing, {
        origin,
        applicationId,
        expectedApplicationId,
        clientId,
        resource,
        scopes,
        publicBaseUrl,
        tencentCorpId,
        tencentSdkId,
        callbackRef,
        instanceId,
        sealedClientSecret,
        credentialVersion: nextVersion,
      }),
      secrets: this.secrets,
      deployment: this.deployment,
    });
    const identityChanged =
      runtimeIdentity(previousRuntime) !== runtimeIdentity(nextRuntime);
    const isolate = identityChanged || secretMutated;

    const values: Partial<MeetingGatewaySettings> = {
      origin,
      applicationId,
      expectedApplicationId,
      clientId,
      resource,
      scopes,
      publicBaseUrl,
      tencentCorpId,
      tencentSdkId,
      callbackRef,
      instanceId,
      sealedClientSecret,
      credentialVersion: nextVersion,
      updatedBy: actor,
      updatedAt: now,
    };

    await this.connection.transaction(async (trx) => {
      const settings = trx.repository<MeetingGatewaySettings>(
        MEETING_GATEWAY_SETTINGS,
      );
      if (existing) {
        await settings.updateOne({
          filter: { id: existing.id },
          values,
        });
      } else {
        await settings.createOne({
          values: {
            id: SETTINGS_ID,
            origin,
            applicationId,
            expectedApplicationId,
            clientId,
            resource,
            scopes,
            publicBaseUrl,
            tencentCorpId,
            tencentSdkId,
            callbackRef,
            instanceId,
            sealedClientSecret,
            credentialVersion: nextVersion,
            updatedBy: actor,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      if (isolate) {
        await this.isolateBindings(
          trx,
          previousRuntime.instanceId || 'default',
          nextRuntime.instanceId || 'default',
          now,
        );
      }
    });
    this.invalidateRuntime();
    return this.get();
  }

  private async isolateBindings(
    connection: DatabaseConnection,
    previousInstanceId: string,
    nextInstanceId: string,
    now: Date,
  ): Promise<void> {
    const states =
      connection.repository<MeetingOauthState>(MEETING_OAUTH_STATES);
    const pending = await states.findMany({
      filter: buildFilter((filter) => filter.date('consumedAt').empty()),
    });
    for (const row of pending) {
      await states.updateOne({
        filter: { id: row.id },
        values: { consumedAt: now },
      });
    }
    const targetInstanceId =
      previousInstanceId === nextInstanceId
        ? previousInstanceId
        : nextInstanceId;
    const bindings = connection.repository<MeetingGatewayBinding>(
      MEETING_GATEWAY_BINDINGS,
    );
    const rows = await bindings.findMany({
      filter: buildFilter((filter) =>
        filter.string('gatewayInstanceId').eq(targetInstanceId),
      ),
    });
    for (const row of rows) {
      if (row.status === 'disconnected' && !row.sealedAccessToken) continue;
      await bindings.updateOne({
        filter: { id: row.id },
        values: {
          status: 'disconnected',
          credentialVersion: row.credentialVersion + 1,
          sealedAccessToken: null,
          sealedRefreshToken: null,
          updatedAt: now,
        },
      });
    }
  }

  private publicRow(
    row: MeetingGatewaySettings | undefined,
  ): GatewaySettingsPublic {
    const runtime = resolveMeetingGatewayRuntime({
      row,
      secrets: this.secrets,
      deployment: this.deployment,
    });
    const originConfigured = Boolean(
      runtime.origin && runtime.originAllowlist.length,
    );
    return {
      origin: row?.origin ?? null,
      applicationId: row?.applicationId ?? null,
      expectedApplicationId: row?.expectedApplicationId ?? null,
      clientId: row?.clientId ?? null,
      resource: row?.resource ?? null,
      scopes: asScopeList(row?.scopes),
      publicBaseUrl: row?.publicBaseUrl ?? null,
      tencentCorpId: row?.tencentCorpId ?? null,
      tencentSdkId: row?.tencentSdkId ?? null,
      callbackRef: row?.callbackRef ?? null,
      instanceId: row?.instanceId ?? null,
      hasSecret: runtime.hasSecret,
      credentialVersion: runtime.settingsCredentialVersion,
      sources: runtime.sources,
      runtime: {
        origin: runtime.origin ?? null,
        applicationId: runtime.applicationId ?? null,
        clientId: runtime.clientId ?? null,
        instanceId: runtime.instanceId || 'default',
        configured: originConfigured && Boolean(runtime.applicationId),
      },
      deployment: {
        originAllowlist: [...runtime.originAllowlist],
        authorizationPathAllowlist: [...runtime.authorizationPathAllowlist],
        testAdapter: runtime.testAdapter,
        adapterKind: runtime.testAdapter ? 'test' : 'http',
        identityIssuance: runtime.testAdapter ? 'test-adapter' : 'unavailable',
        queryHttpContract: 'unavailable',
        liveVerified: false,
        testAdapterRequiresRestart: true,
        originHotReload: true,
      },
      savedDoesNotVerify: true,
      saveDoesNotBind: true,
      updatedAt: row ? toIso(row.updatedAt) : null,
    };
  }
}
