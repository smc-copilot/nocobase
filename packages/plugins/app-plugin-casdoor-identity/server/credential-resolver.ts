import type {
  CredentialResolver,
  IssuedCredential,
} from '@nocobase/app-plugin-authentication/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';

import {
  CASDOOR_ACCESS_TOKEN_HEADER,
  CASDOOR_ACCESS_TOKEN_SCHEME,
  CASDOOR_CREDENTIAL_TYPE,
  type CasdoorIdentityConfig,
} from './config.js';

export interface CasdoorCredentialResolverOptions {
  readonly connection: () => DatabaseConnection;
  readonly config: () => CasdoorIdentityConfig | undefined;
}

function readAccessToken(headers: Headers): string | undefined {
  const dedicated = headers.get(CASDOOR_ACCESS_TOKEN_HEADER)?.trim();
  if (dedicated) return dedicated;
  const authorization = headers.get('authorization');
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
}

function jwksGetKey(config: CasdoorIdentityConfig): JWTVerifyGetKey {
  if (config.jwks?.keys?.length) {
    return createLocalJWKSet(config.jwks as JSONWebKeySet);
  }
  if (!config.jwksUri) {
    throw new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'CASDOOR_JWKS_NOT_CONFIGURED',
      domain: 'casdoor-identity',
      message: 'casdoorIdentity.jwksUri or casdoorIdentity.jwks is required.',
    });
  }
  return createRemoteJWKSet(new URL(config.jwksUri));
}

function verifyAudience(
  config: CasdoorIdentityConfig,
): string | string[] | undefined {
  if (typeof config.audience === 'string') return config.audience;
  if (config.audience) return [...config.audience];
  return undefined;
}

async function verifyAccessToken(
  token: string,
  config: CasdoorIdentityConfig,
): Promise<JWTPayload> {
  if (!config.issuer) {
    throw new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'CASDOOR_ISSUER_NOT_CONFIGURED',
      domain: 'casdoor-identity',
      message: 'casdoorIdentity.issuer is required.',
    });
  }
  try {
    const { payload } = await jwtVerify(token, jwksGetKey(config), {
      issuer: config.issuer,
      audience: verifyAudience(config),
    });
    return payload;
  } catch {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: 'casdoor-identity',
      message: 'The Casdoor access token is missing, invalid, or expired.',
    });
  }
}
/**
 * Resolves a Casdoor (or compatible) JWT into an issued credential for a bound local user.
 *
 * Returns `undefined` when the request carries no Casdoor token so other resolvers can run.
 * A present but invalid, unbound, or disabled credential throws `ApiError`.
 */
export function createCasdoorCredentialResolver(
  options: CasdoorCredentialResolverOptions,
): CredentialResolver {
  return async (headers) => {
    const token = readAccessToken(headers);
    if (!token) return undefined;

    const config = options.config() ?? {};
    const payload = await verifyAccessToken(token, config);
    const issuer =
      typeof payload.iss === 'string' ? payload.iss : config.issuer;
    const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!issuer || !subject) {
      throw new ApiError({
        status: 'UNAUTHENTICATED',
        reason: 'AUTH_REQUIRED',
        domain: 'casdoor-identity',
        message: 'The access token is missing issuer or subject claims.',
      });
    }

    const connection = options.connection();
    const binding = await connection.query
      .selectFrom('externalIdentities')
      .select(['id', 'localUserId'])
      .where('providerIssuer', '=', issuer)
      .where('providerSubject', '=', subject)
      .executeTakeFirst();

    if (!binding) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'SUBJECT_BINDING_REQUIRED',
        domain: 'casdoor-identity',
        message: 'No local user is bound to this external subject.',
      });
    }

    const user = await connection.query
      .selectFrom('user')
      .select(['id', 'disabledAt'])
      .where('id', '=', binding.localUserId)
      .executeTakeFirst();

    if (!user) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'SUBJECT_BINDING_REQUIRED',
        domain: 'casdoor-identity',
        message: 'The bound local user no longer exists.',
      });
    }
    if (user.disabledAt != null) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCOUNT_DISABLED',
        domain: 'casdoor-identity',
        message: 'The bound local user is disabled.',
      });
    }

    const localUserId = String(user.id);
    const bindingId = String(binding.id);
    const credential: IssuedCredential = {
      type: CASDOOR_CREDENTIAL_TYPE,
      id: bindingId,
      userId: localUserId,
      scheme: CASDOOR_ACCESS_TOKEN_SCHEME,
      expiresAt:
        typeof payload.exp === 'number'
          ? new Date(payload.exp * 1000)
          : undefined,
      data: { issuer, subject },
    };
    return credential;
  };
}
