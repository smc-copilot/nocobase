import type { ExternalIdentityClaims } from '../admission.js';
import type { ProviderType } from '../model.js';

export type { ExternalIdentityClaims };

/** What a provider implementation can do. Absent operations stay false. */
export interface ProviderCapabilities {
  readonly authenticate: boolean;
  readonly resolveIdentity: boolean;
  readonly directoryRead: boolean;
  readonly groupRead: boolean;
  readonly organizationRead: boolean;
  readonly statusRead: boolean;
  readonly userInfo: boolean;
  readonly credentialLifecycle: boolean;
}

export interface VerifiedIdentity {
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly issuer?: string;
  readonly subject: string;
  readonly externalId?: string;
  readonly externalUsername?: string;
  readonly identityKey: string;
  readonly claims: ExternalIdentityClaims;
}

export interface AuthenticationInput {
  readonly code?: string;
  readonly state?: string;
  readonly expectedState?: string;
  readonly nonce?: string;
  readonly codeVerifier?: string;
  readonly redirectUri?: string;
  readonly username?: string;
  readonly password?: string;
  readonly dn?: string;
}

export interface IdentityResolveInput {
  readonly manualAccountId?: string;
  readonly issuer?: string;
  readonly subject?: string;
  readonly externalId?: string;
  readonly externalUsername?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly idToken?: string;
  readonly nonce?: string;
  readonly ltpaToken?: string;
  /** Untrusted hint. OA LTPA ignores this unless the verifier returns the same employee number. */
  readonly employeeNo?: string;
}

export interface DirectoryPageInput {
  readonly pageSize?: number;
  readonly cursor?: string | null;
}

export interface DirectoryPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
}

export interface DirectoryUser {
  readonly externalId: string;
  readonly identityKey: string;
  readonly externalUsername?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly employeeNo?: string;
  readonly dn?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface DirectoryGroup {
  readonly externalId: string;
  readonly name: string;
}

export interface IdentityDirectoryConnector {
  listUsers(input: DirectoryPageInput): Promise<DirectoryPage<DirectoryUser>>;
  getUser?(externalId: string): Promise<DirectoryUser | undefined>;
  listGroups?(
    input: DirectoryPageInput,
  ): Promise<DirectoryPage<DirectoryGroup>>;
  getUserStatus?(externalId: string): Promise<string | undefined>;
}

export interface ProviderHealth {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly detail: string | null;
}

/**
 * Provider facts an adapter needs. `ProviderView` satisfies this structurally.
 * Adapters do not write persons or application users.
 */
export interface ProviderBinding {
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly issuer: string | null;
  readonly discoveryUrl: string | null;
  readonly endpoints: Readonly<Record<string, unknown>> | null;
  readonly claimMapping: Readonly<Record<string, unknown>> | null;
  readonly syncPolicy: Readonly<Record<string, unknown>> | null;
}

export interface IdentityProviderAdapter {
  readonly providerType: ProviderType;
  capabilities(): ProviderCapabilities;
  authenticate?(input: AuthenticationInput): Promise<VerifiedIdentity>;
  resolveIdentity?(input: IdentityResolveInput): Promise<VerifiedIdentity>;
  healthCheck(): Promise<ProviderHealth>;
  directory?(): IdentityDirectoryConnector | undefined;
}

/** Production LDAP clients keep certificate verification on. `false` is not assignable. */
export interface LdapTlsConfig {
  readonly rejectUnauthorized: true;
}

export interface LdapClientConfig {
  readonly url: string;
  readonly tls: LdapTlsConfig;
}

export interface LdapDirectoryEntry {
  readonly dn: string;
  readonly objectGUID?: string | null;
  readonly entryUUID?: string | null;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface LdapClient {
  readonly config?: LdapClientConfig;
  bind?(input: {
    readonly dn: string;
    readonly password: string;
  }): Promise<LdapDirectoryEntry | undefined>;
  searchUsers(
    page: DirectoryPageInput,
  ): Promise<DirectoryPage<LdapDirectoryEntry>>;
  health(): Promise<{ ok: boolean; detail?: string | null }>;
}

export interface OidcCodeExchange {
  readonly code: string;
  readonly codeVerifier?: string;
  readonly redirectUri?: string;
}

export interface OidcClient {
  fetchDiscovery?(): Promise<{
    readonly issuer?: string;
    readonly jwksUri?: string;
  }>;
  fetchJwks(): Promise<{ readonly keys: readonly unknown[] }>;
  exchangeCode(
    input: OidcCodeExchange,
  ): Promise<{ readonly idToken: string; readonly accessToken?: string }>;
  fetchUserInfo?(
    accessToken: string,
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface OidcVerifyChecks {
  readonly issuer: string;
  readonly audience: string;
  readonly nonce?: string;
}

export interface VerifiedIdToken {
  readonly iss: string;
  readonly sub: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

/** Tests inject this. Production verification uses `verifyIdToken` and JWKS. */
export interface OidcVerifier {
  verifyIdToken(
    token: string,
    checks: OidcVerifyChecks,
  ): Promise<VerifiedIdToken>;
}

export interface OAuth2UserInfoClient {
  exchangeCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri?: string;
  }): Promise<{ readonly accessToken: string }>;
  fetchUserInfo(
    accessToken: string,
  ): Promise<Readonly<Record<string, unknown>>>;
  health?(): Promise<{ ok: boolean; detail?: string | null }>;
}

export interface CasdoorDirectoryUser {
  readonly subject: string;
  readonly name?: string;
  readonly email?: string;
  readonly owner?: string;
  readonly employeeNo?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface CasdoorDirectoryClient {
  listUsers(
    input: DirectoryPageInput,
  ): Promise<DirectoryPage<CasdoorDirectoryUser>>;
  health?(): Promise<{ ok: boolean; detail?: string | null }>;
}

export interface OaLtpaVerifyInput {
  readonly ltpaToken?: string;
}

export interface OaLtpaVerifier {
  verify(
    input: OaLtpaVerifyInput,
  ): Promise<{ readonly employeeNo: string } | undefined>;
}

/** Injected network clients. Missing clients make network methods throw "not configured". */
export interface AdapterDependencies {
  readonly ldap?: LdapClient;
  readonly oidc?: OidcClient;
  readonly oidcVerifier?: OidcVerifier;
  readonly oauth2?: OAuth2UserInfoClient;
  readonly casdoor?: CasdoorDirectoryClient;
  readonly oa?: OaLtpaVerifier;
  readonly now?: () => Date;
}
