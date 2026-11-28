export {
  claimMappingFrom,
  claimValues,
  DEFAULT_CLAIM_MAPPING,
  extractIdentity,
  readClaim,
  type ClaimMapping,
} from './claim-mapping.js';
export { AdapterRegistry, type AdapterFactory } from './registry.js';
export { verifyIdToken } from './oidc.js';
export type {
  AdapterDependencies,
  AuthenticationInput,
  CasdoorDirectoryClient,
  DirectoryPage,
  DirectoryPageInput,
  DirectoryUser,
  IdentityDirectoryConnector,
  IdentityProviderAdapter,
  IdentityResolveInput,
  LdapClient,
  OaLtpaVerifier,
  OAuth2UserInfoClient,
  OidcClient,
  OidcVerifier,
  ProviderCapabilities,
  ProviderHealth,
  VerifiedIdentity,
} from './types.js';
