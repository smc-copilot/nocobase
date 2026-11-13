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
}

export const CASDOOR_ACCESS_TOKEN_SCHEME = 'casdoorAccessToken';
export const CASDOOR_CREDENTIAL_TYPE = 'casdoor';
export const CASDOOR_ACCESS_TOKEN_HEADER = 'x-casdoor-access-token';
