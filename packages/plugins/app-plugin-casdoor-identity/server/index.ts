export { default } from './plugin.js';
export type {
  CasdoorDirectoryConfig,
  CasdoorIdentityConfig,
  CasdoorIdentitySyncConfig,
} from './config.js';
export {
  CASDOOR_ACCESS_TOKEN_HEADER,
  CASDOOR_ACCESS_TOKEN_SCHEME,
  CASDOOR_CREDENTIAL_TYPE,
} from './config.js';
export {
  CASDOOR_OAUTH_PROVIDER_ID,
  claimsFromOAuthTokens,
  createCasdoorBrowserOAuthConfig,
  ensureCasdoorBrowserIdentity,
  getCasdoorBrowserOAuthRuntime,
  setCasdoorBrowserOAuthRuntime,
} from './browser-oauth.js';
export type {
  BrowserLoginProfile,
  CasdoorBrowserOAuthClientOptions,
  CasdoorBrowserOAuthRuntime,
} from './browser-oauth.js';
export type {
  DirectoryPage,
  DirectoryUser,
  IdentityDirectory,
} from './directory.js';
export { createCasdoorDirectory } from './directory.js';
export {
  evaluateAdmission,
  isAdmissionConfigured,
} from './identity/admission.js';
export type {
  AdmissionPolicy,
  ClaimMapping,
  ExternalIdentityClaims,
} from './identity/model.js';
