export const ERROR_DOMAIN = 'enterpriseAppPortal';
export const SETTINGS_CATALOG = 'enterpriseAppPortal.catalog';
export const SETTINGS_AUDIT = 'enterpriseAppPortal.audit';
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

export interface ContractFixtureGrant {
  readonly userId?: string;
  readonly username?: string;
  readonly appCodes: readonly string[];
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
  readonly managementApi?: {
    readonly endpoint: string;
    readonly tokenEnv?: string;
  };
  readonly fixtureGrants?: readonly ContractFixtureGrant[];
}

export interface EnterpriseAppPortalConfig {
  /**
   * Hostnames the deployment already trusts for launch and health. Saving an
   * application URL never adds to this list.
   */
  readonly launchHostAllowlist?: readonly string[];
  readonly health?: {
    readonly timeoutMs?: number;
    readonly concurrency?: number;
    readonly cacheTtlMs?: number;
  };
  readonly access?: EnterpriseAppPortalAccessConfig;
}

export const MAX_ACCESS_CACHE_TTL_MS = 60_000;
export const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
export const DEFAULT_HEALTH_CONCURRENCY = 3;
export const DEFAULT_HEALTH_CACHE_TTL_MS = 30_000;
