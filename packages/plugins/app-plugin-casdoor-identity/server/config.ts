/**
 * Configuration under `casdoorIdentity` in the application config.
 *
 * JWKS verification settings are required before the credential resolver accepts tokens.
 * Live Casdoor connectivity is a separate evidence step; CI tests inject an ephemeral JWKS.
 */
export interface CasdoorIdentityConfig {
  readonly issuer?: string;
  readonly audience?: string | readonly string[];
  /** Absolute JWKS URL, for example `https://sso.example.com/.well-known/jwks`. */
  readonly jwksUri?: string;
  /**
   * Optional static JWKS document for tests or air-gapped spikes. When set, `jwksUri` is ignored.
   * Production deployments should use `jwksUri`.
   */
  readonly jwks?: {
    readonly keys: readonly Record<string, unknown>[];
  };
  /**
   * The Permission Set keys a mapping rule may grant. Anything else is refused, so an external
   * attribute can never name an arbitrary set (and never `root`). Empty or absent means no rule
   * may grant anything.
   */
  readonly mappablePermissionSets?: readonly string[];
  /** Periodic reconciliation against the identity directory. */
  readonly sync?: CasdoorIdentitySyncConfig;
  /** How the sync reads users from Casdoor. Absent means periodic sync has no source. */
  readonly directory?: CasdoorDirectoryConfig;
}

export interface CasdoorIdentitySyncConfig {
  /** Register the periodic sync with the scheduler. Defaults to `true` once a directory is configured. */
  readonly enabled?: boolean;
  /** Cron expression for the scheduler schedule. Defaults to every 15 minutes. */
  readonly cron?: string;
  readonly timezone?: string;
  /** Provider the scheduled run reconciles. Defaults to the only enabled provider. */
  readonly providerId?: string;
  /** Directory page size. Defaults to 100. */
  readonly pageSize?: number;
  /**
   * Interval for the in-process fallback timer used only when the Scheduler plugin is not
   * registered. Unset disables the fallback.
   */
  readonly fallbackIntervalSeconds?: number;
  /**
   * How long a directory attribute snapshot remains authoritative for Permission Set mapping
   * on login (seconds). Defaults to 600 (10 minutes). After the first sync, a stale snapshot
   * blocks JWT-driven grant upgrades.
   */
  readonly snapshotMaxAgeSeconds?: number;
}

export interface CasdoorDirectoryConfig {
  /** Casdoor base URL, for example `https://sso.example.com`. */
  readonly endpoint: string;
  /** Casdoor organization (the `owner` of users) to list. */
  readonly organization: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export const CASDOOR_ACCESS_TOKEN_SCHEME = 'casdoorAccessToken';
export const CASDOOR_CREDENTIAL_TYPE = 'casdoor';
export const CASDOOR_ACCESS_TOKEN_HEADER = 'x-casdoor-access-token';

/** The Scheduler target type and schedule key this plugin registers. */
export const IDENTITY_SYNC_TARGET_TYPE = 'casdoorIdentity.sync';
export const IDENTITY_SYNC_SCHEDULE_KEY = 'casdoor-identity-sync';
export const DEFAULT_SYNC_CRON = '*/15 * * * *';

/** Authorization settings items (see `server/authorization.ts`). */
export const SETTINGS_SYNC = 'casdoorIdentity.sync';
export const SETTINGS_MAPPING = 'casdoorIdentity.mapping';
export const SETTINGS_SUBJECT_BINDINGS = 'casdoorIdentity.subjectBindings';
export const ERROR_DOMAIN = 'casdoorIdentity';
