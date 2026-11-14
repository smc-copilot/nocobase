export const ERROR_DOMAIN: string = 'agent-authorization';

export const AGENT_ACCESS_TOKEN_SCHEME: string = 'agentAccessToken';
export const AGENT_ACCESS_TOKEN_HEADER: string = 'x-agent-access-token';
export const AGENT_CREDENTIAL_TYPE: string = 'agent';

export const SETTINGS_CLIENTS: string = 'agentAuthorization.clients';
export const SETTINGS_GRANTS: string = 'agentAuthorization.grants';
export const SETTINGS_AUDIT: string = 'agentAuthorization.audit';

export const SCOPES: readonly ['business-ui:view', 'business-ui:edit'] = [
  'business-ui:view',
  'business-ui:edit',
];
export type AgentScope = (typeof SCOPES)[number];

export const AUTH_CODE_TTL_SECONDS: number = 120;
export const ACCESS_TOKEN_TTL_SECONDS: number = 3600;
export const REFRESH_TOKEN_TTL_SECONDS: number = 2_592_000;

export const ACCESS_TOKEN_PREFIX: string = 'agt_a_';
export const REFRESH_TOKEN_PREFIX: string = 'agt_r_';
export const AUTH_CODE_PREFIX: string = 'agt_c_';

export interface AgentAuthorizationConfig {
  /** Resource audience for issued tokens (defaults to the app public origin). */
  readonly audience?: string;
  readonly issuer?: string;
  readonly authCodeTtlSeconds?: number;
  readonly accessTokenTtlSeconds?: number;
  readonly refreshTokenTtlSeconds?: number;
}
