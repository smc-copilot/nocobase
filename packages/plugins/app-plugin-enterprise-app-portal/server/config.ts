export const ERROR_DOMAIN = 'enterpriseAppPortal';
export const SETTINGS_CATALOG = 'enterpriseAppPortal.catalog';
export const SETTINGS_AUDIT = 'enterpriseAppPortal.audit';
export const SETTINGS_CASDOOR = 'enterpriseAppPortal.casdoor';
export const PORTAL_SETTINGS_SECTION = 'enterprise-app-portal';

export const APP_TYPES = ['octop', 'weknora', 'nocobase', 'https'] as const;
export type PortalAppType = (typeof APP_TYPES)[number];

export const AUTO_LAUNCH_MODES = [
  'disabled',
  'if_single',
  'default_if_valid',
] as const;
export type AutoLaunchMode = (typeof AUTO_LAUNCH_MODES)[number];

export const ACCESS_SOURCES = [
  'unconfigured',
  'verifiedClaims',
  'managementApi',
  'contractFixture',
] as const;
export type AccessSource = (typeof ACCESS_SOURCES)[number];

export const CASDOOR_AUTH_MODES = ['query', 'clientCredentials'] as const;
export type CasdoorManagementAuth = (typeof CASDOOR_AUTH_MODES)[number];

/** Casdoor Permission.name prefix. The remainder is the Casdoor application name. */
export const DEFAULT_CASDOOR_PERMISSION_PREFIX = 'nocobase-portal-app-';

export const CASDOOR_ENDPOINT_ENV = 'CASDOOR_ENDPOINT';
export const CASDOOR_CLIENT_ID_ENV = 'CASDOOR_CLIENT_ID';
export const CASDOOR_CLIENT_SECRET_ENV = 'CASDOOR_CLIENT_SECRET';
export const CASDOOR_ORGANIZATION_ENV = 'CASDOOR_ORGANIZATION';
export const CASDOOR_APPLICATION_OWNER_ENV = 'CASDOOR_APPLICATION_OWNER';
export const CASDOOR_PERMISSION_OWNER_ENV = 'CASDOOR_PERMISSION_OWNER';
export const DEFAULT_CASDOOR_APPLICATION_OWNER = 'admin';

const PERMISSION_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*-$/u;

export interface ContractFixtureGrant {
  readonly userId?: string;
  readonly username?: string;
  readonly appCodes: readonly string[];
}

export interface CasdoorManagementConfig {
  /** Casdoor origin, for example `http://casdoor.internal:8000`. No `/api` suffix. */
  readonly endpoint?: string;
  /** Env var for the origin when `endpoint` is unset. Default `CASDOOR_ENDPOINT`. */
  readonly endpointEnv?: string;
  /**
   * Env var holding the management client id. Default `CASDOOR_CLIENT_ID`.
   * The id itself is not stored here.
   */
  readonly clientIdEnv?: string;
  /** Env var holding the management client secret. Default `CASDOOR_CLIENT_SECRET`. */
  readonly clientSecretEnv?: string;
  /**
   * Optional client id copied by the application env mapping. The named env var wins.
   * Do not commit a real value.
   */
  readonly clientId?: string;
  /** Optional client secret copied by the application env mapping. The named env var wins. */
  readonly clientSecret?: string;
  /** Casdoor organization that owns users and, by default, permissions. */
  readonly organization?: string;
  readonly organizationEnv?: string;
  /** Owner of Casdoor application records. Default `admin`. */
  readonly applicationOwner?: string;
  readonly applicationOwnerEnv?: string;
  /** Owner of portal Permission records. Default: the organization. */
  readonly permissionOwner?: string;
  readonly permissionOwnerEnv?: string;
  /**
   * `query` sends clientId and clientSecret on each request.
   * `clientCredentials` exchanges them for a bearer token.
   */
  readonly auth?: CasdoorManagementAuth;
  /** Must end with `-`. Default `nocobase-portal-app-`. */
  readonly permissionNamePrefix?: string;
}

export interface EnterpriseAppPortalAccessConfig {
  /**
   * How Casdoor application access is read. Default `unconfigured` fails closed.
   * `contractFixture` is isolation-only and must never be used against a real IdP.
   */
  readonly source?: AccessSource;
  /** Cache of authorized app keys, capped at 60 seconds. */
  readonly cacheTtlMs?: number;
  /** Dotted claim path used when `source` is `verifiedClaims`. */
  readonly claimPath?: string;
  /** Map a claim value (group/role/application key) to a catalog `appCode`. */
  readonly groupToApp?: Readonly<Record<string, string>>;
  readonly managementApi?: CasdoorManagementConfig;
  readonly fixtureGrants?: readonly ContractFixtureGrant[];
}

export interface EnterpriseAppPortalConfig {
  /**
   * Hostnames the deployment already trusts for launch and health. Saving an
   * application URL never adds to this list.
   */
  readonly launchHostAllowlist?: readonly string[];
  /**
   * When true, allowlisted hosts may use `http://` launch URLs (intranet).
   * Default remains HTTPS-only.
   */
  readonly launchAllowHttp?: boolean;
  /**
   * When true, skip private/link-local DNS rejection for allowlisted hosts.
   * Use only on trusted intranet deployments.
   */
  readonly launchAllowPrivateDns?: boolean;
  readonly health?: {
    readonly timeoutMs?: number;
    readonly concurrency?: number;
    readonly cacheTtlMs?: number;
  };
  readonly access?: EnterpriseAppPortalAccessConfig;
}

export interface ResolvedCasdoorManagement {
  readonly endpoint: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly organization: string;
  readonly applicationOwner: string;
  readonly permissionOwner: string;
  readonly auth: CasdoorManagementAuth;
  readonly permissionNamePrefix: string;
}

export const MAX_ACCESS_CACHE_TTL_MS = 60_000;
export const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
export const DEFAULT_HEALTH_CONCURRENCY = 3;
export const DEFAULT_HEALTH_CACHE_TTL_MS = 30_000;

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string | undefined,
): string | undefined {
  if (!name) return undefined;
  return trimmed(env[name]);
}

function httpEndpoint(value: string | undefined): string | undefined {
  const text = trimmed(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}

/**
 * Resolves the management client settings. Returns undefined when the endpoint,
 * organization, or either credential is missing, or when the prefix or auth mode
 * is not usable. Callers fail closed on undefined.
 */
export function resolveCasdoorManagement(
  access: EnterpriseAppPortalAccessConfig | undefined,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedCasdoorManagement | undefined {
  const api = access?.managementApi;
  const endpoint = httpEndpoint(
    api?.endpoint ?? envValue(env, api?.endpointEnv ?? CASDOOR_ENDPOINT_ENV),
  );
  const clientId =
    envValue(env, api?.clientIdEnv ?? CASDOOR_CLIENT_ID_ENV) ??
    trimmed(api?.clientId);
  const clientSecret =
    envValue(env, api?.clientSecretEnv ?? CASDOOR_CLIENT_SECRET_ENV) ??
    trimmed(api?.clientSecret);
  const organization =
    trimmed(api?.organization) ??
    envValue(env, api?.organizationEnv ?? CASDOOR_ORGANIZATION_ENV);
  if (!endpoint || !clientId || !clientSecret || !organization)
    return undefined;
  if (organization.includes('/')) return undefined;
  const auth = api?.auth ?? 'query';
  if (!CASDOOR_AUTH_MODES.includes(auth)) return undefined;
  const prefix = api?.permissionNamePrefix ?? DEFAULT_CASDOOR_PERMISSION_PREFIX;
  if (!PERMISSION_PREFIX_PATTERN.test(prefix) || prefix.length > 40) {
    return undefined;
  }
  const applicationOwner =
    trimmed(api?.applicationOwner) ??
    envValue(env, api?.applicationOwnerEnv ?? CASDOOR_APPLICATION_OWNER_ENV) ??
    DEFAULT_CASDOOR_APPLICATION_OWNER;
  const permissionOwner =
    trimmed(api?.permissionOwner) ??
    envValue(env, api?.permissionOwnerEnv ?? CASDOOR_PERMISSION_OWNER_ENV) ??
    organization;
  if (applicationOwner.includes('/') || permissionOwner.includes('/')) {
    return undefined;
  }
  return {
    endpoint,
    clientId,
    clientSecret,
    organization,
    applicationOwner,
    permissionOwner,
    auth,
    permissionNamePrefix: prefix,
  };
}
