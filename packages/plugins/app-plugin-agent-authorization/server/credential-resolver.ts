import type {
  CredentialResolver,
  IssuedCredential,
} from '@nocobase/app-plugin-authentication/server';
import { ApiError } from '@nocobase/app-server/router';

import {
  ACCESS_TOKEN_PREFIX,
  AGENT_ACCESS_TOKEN_HEADER,
  AGENT_ACCESS_TOKEN_SCHEME,
  AGENT_CREDENTIAL_TYPE,
  ERROR_DOMAIN,
} from './config.js';
import type { AgentAuthorizationServices } from './services/index.js';

export interface AgentCredentialResolverOptions {
  readonly services: () => AgentAuthorizationServices;
}

function readAccessToken(
  headers: Headers,
): { readonly token: string; readonly claimed: boolean } | undefined {
  const dedicated = headers.get(AGENT_ACCESS_TOKEN_HEADER)?.trim();
  if (dedicated) return { token: dedicated, claimed: true };
  const authorization = headers.get('authorization');
  if (!authorization) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  const token = match?.[1];
  if (!token || !token.startsWith(ACCESS_TOKEN_PREFIX)) return undefined;
  return { token, claimed: true };
}

/**
 * Resolves opaque NocoBase-issued agent access tokens.
 * Bearer tokens that do not use the `agt_a_` prefix fall through to other resolvers / session lookup.
 */
export function createAgentCredentialResolver(
  options: AgentCredentialResolverOptions,
): CredentialResolver {
  return async (headers): Promise<IssuedCredential | undefined> => {
    const presented = readAccessToken(headers);
    if (!presented) return undefined;
    const resolved = await options
      .services()
      .oauth.resolveAccessToken(presented.token);
    if (!resolved) {
      if (!presented.claimed) return undefined;
      throw new ApiError({
        status: 'UNAUTHENTICATED',
        reason: 'INVALID_GRANT',
        domain: ERROR_DOMAIN,
        message: 'Agent access token is invalid, expired, or revoked.',
      });
    }
    return {
      type: AGENT_CREDENTIAL_TYPE,
      id: resolved.tokenId,
      userId: resolved.userId,
      scheme: AGENT_ACCESS_TOKEN_SCHEME,
      data: {
        clientId: resolved.clientId,
        grantId: resolved.grantId,
        scope: resolved.scope,
        audience: resolved.audience,
        grantRevision: resolved.grantRevision,
      },
    };
  };
}
