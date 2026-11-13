import type {
  CredentialResolver,
  IssuedCredential,
} from '@nocobase/app-plugin-authentication/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeJwt,
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

interface ReadAccessTokenResult {
  readonly token: string;
  /** True when the dedicated Casdoor header was used (always claim this token). */
  readonly dedicated: boolean;
}

function readAccessToken(headers: Headers): ReadAccessTokenResult | undefined {
  const dedicated = headers.get(CASDOOR_ACCESS_TOKEN_HEADER)?.trim();
  if (dedicated) return { token: dedicated, dedicated: true };
  const authorization = headers.get('authorization');
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  if (!token) return undefined;
  return { token, dedicated: false };
}

/**
 * Bearer tokens that are not Casdoor access tokens (e.g. Better Auth session tokens) must fall
 * through to the next credential resolver / session lookup. Only claim a Bearer JWT when its
 * unverified `iss` matches the configured Casdoor issuer.
 */
function bearerClaimsOurIssuer(
  token: string,
  issuer: string | undefined,
): boolean {
  if (!issuer) return false;
  try {
    return decodeJwt(token).iss === issuer;
  } catch {
    return false;
  }
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
    const presented = readAccessToken(headers);
    if (!presented) return undefined;

    const config = options.config() ?? {};
    if (
      !presented.dedicated &&
      !bearerClaimsOurIssuer(presented.token, config.issuer)
    ) {
      return undefined;
    }

    const payload = await verifyAccessToken(presented.token, config);
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
