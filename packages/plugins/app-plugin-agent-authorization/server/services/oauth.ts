import type { DatabaseManager } from '@nocobase/db';

import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_PREFIX,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_SECONDS,
  SCOPES,
  type AgentAuthorizationConfig,
} from '../config.js';
import {
  hashAuthCode,
  hashToken,
  pkceS256Challenge,
  randomId,
  randomSecret,
  secretsEqual,
} from '../crypto.js';
import { oauthError } from './errors.js';
import type {
  AgentAuthorizationServices,
  ResolvedAccessToken,
  TokenResponse,
} from './types.js';

function now(): Date {
  return new Date();
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function createOAuthService(options: {
  readonly database: () => DatabaseManager;
  readonly config: () => AgentAuthorizationConfig;
  readonly clients: AgentAuthorizationServices['clients'];
  readonly grants: AgentAuthorizationServices['grants'];
}) {
  const db = () => options.database().connection().query;

  function ttls() {
    const config = options.config();
    return {
      code: config.authCodeTtlSeconds ?? AUTH_CODE_TTL_SECONDS,
      access: config.accessTokenTtlSeconds ?? ACCESS_TOKEN_TTL_SECONDS,
      refresh: config.refreshTokenTtlSeconds ?? REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  async function issueTokenPair(input: {
    readonly grantId: string;
    readonly clientId: string;
    readonly localUserId: string;
    readonly scope: string;
    readonly audience: string;
    readonly grantRevision: number;
  }): Promise<TokenResponse & { readonly refreshId: string }> {
    const createdAt = now();
    const { access, refresh } = ttls();
    const accessPlain = `${ACCESS_TOKEN_PREFIX}${randomSecret()}`;
    const refreshPlain = `${REFRESH_TOKEN_PREFIX}${randomSecret()}`;
    const accessId = randomId('atok');
    const refreshId = randomId('rtok');
    await db()
      .insertInto('agentTokens')
      .values([
        {
          id: accessId,
          digest: hashToken(accessPlain),
          grantId: input.grantId,
          clientId: input.clientId,
          localUserId: input.localUserId,
          kind: 'access',
          scope: input.scope,
          audience: input.audience,
          expiresAt: addSeconds(createdAt, access),
          revokedAt: null,
          rotatedToId: null,
          grantRevision: input.grantRevision,
          createdAt,
        },
        {
          id: refreshId,
          digest: hashToken(refreshPlain),
          grantId: input.grantId,
          clientId: input.clientId,
          localUserId: input.localUserId,
          kind: 'refresh',
          scope: input.scope,
          audience: input.audience,
          expiresAt: addSeconds(createdAt, refresh),
          revokedAt: null,
          rotatedToId: null,
          grantRevision: input.grantRevision,
          createdAt,
        },
      ])
      .execute();
    return {
      access_token: accessPlain,
      token_type: 'Bearer',
      expires_in: access,
      refresh_token: refreshPlain,
      scope: input.scope,
      refreshId,
    };
  }

  function asTokenResponse(
    issued: TokenResponse & { readonly refreshId: string },
  ): TokenResponse {
    return {
      access_token: issued.access_token,
      token_type: issued.token_type,
      expires_in: issued.expires_in,
      refresh_token: issued.refresh_token,
      scope: issued.scope,
    };
  }

  function narrowedScope(
    current: string,
    requested: string | undefined,
  ): string {
    if (!requested?.trim()) return current;
    const next = requested.split(/\s+/u).filter(Boolean);
    const held = new Set(current.split(/\s+/u).filter(Boolean));
    const known = new Set<string>(SCOPES);
    if (next.length === 0) {
      throw oauthError('INVALID_SCOPE', 'Scope is empty');
    }
    for (const scope of next) {
      if (!known.has(scope) || !held.has(scope)) {
        throw oauthError('INVALID_SCOPE', 'Refresh cannot expand scope');
      }
    }
    return next.join(' ');
  }

  return {
    async createAuthorizationCode(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly grantId: string;
      readonly redirectUri: string;
      readonly codeChallenge: string;
      readonly scope: string;
    }): Promise<string> {
      const createdAt = now();
      const plaintext = `${AUTH_CODE_PREFIX}${randomSecret()}`;
      await db()
        .insertInto('agentAuthCodes')
        .values({
          id: randomId('code'),
          digest: hashAuthCode(plaintext),
          clientId: input.clientId,
          localUserId: input.localUserId,
          grantId: input.grantId,
          redirectUri: input.redirectUri,
          codeChallenge: input.codeChallenge,
          scope: input.scope,
          expiresAt: addSeconds(createdAt, ttls().code),
          consumedAt: null,
          createdAt,
        })
        .execute();
      return plaintext;
    },

    async exchangeAuthorizationCode(input: {
      readonly clientId: string;
      readonly code: string;
      readonly redirectUri: string;
      readonly codeVerifier: string;
    }): Promise<TokenResponse> {
      if (!input.code.startsWith(AUTH_CODE_PREFIX)) {
        throw oauthError('INVALID_GRANT', 'Invalid authorization code');
      }
      const digest = hashAuthCode(input.code);
      const row = await db()
        .selectFrom('agentAuthCodes')
        .selectAll()
        .where('digest', '=', digest)
        .where('clientId', '=', input.clientId)
        .executeTakeFirst();
      if (!row) {
        throw oauthError('INVALID_GRANT', 'Invalid authorization code');
      }
      if (row.consumedAt) {
        throw oauthError('INVALID_GRANT', 'Authorization code already used');
      }
      if (new Date(row.expiresAt as Date) < now()) {
        throw oauthError('INVALID_GRANT', 'Authorization code expired');
      }
      if (String(row.redirectUri) !== input.redirectUri) {
        throw oauthError('INVALID_GRANT', 'redirect_uri mismatch');
      }
      const challenge = pkceS256Challenge(input.codeVerifier);
      if (!secretsEqual(challenge, String(row.codeChallenge))) {
        throw oauthError('INVALID_GRANT', 'PKCE verification failed');
      }
      const { grant } = await options.grants.requireUsable(String(row.grantId));
      const consumedAt = now();
      const updated = await db()
        .updateTable('agentAuthCodes')
        .set({ consumedAt })
        .where('id', '=', row.id as string)
        .where('consumedAt', 'is', null)
        .execute();
      if (updated.updatedCount === 0) {
        throw oauthError('INVALID_GRANT', 'Authorization code already used');
      }
      return asTokenResponse(
        await issueTokenPair({
          grantId: grant.id,
          clientId: String(row.clientId),
          localUserId: String(row.localUserId),
          scope: String(row.scope),
          audience: grant.audience,
          grantRevision: grant.revision,
        }),
      );
    },

    async refresh(input: {
      readonly clientId: string;
      readonly refreshToken: string;
      readonly scope?: string;
    }): Promise<TokenResponse> {
      if (!input.refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
        throw oauthError('INVALID_GRANT', 'Invalid refresh token');
      }
      const digest = hashToken(input.refreshToken);
      const row = await db()
        .selectFrom('agentTokens')
        .selectAll()
        .where('digest', '=', digest)
        .where('kind', '=', 'refresh')
        .where('clientId', '=', input.clientId)
        .executeTakeFirst();
      if (!row || row.revokedAt) {
        throw oauthError('INVALID_GRANT', 'Invalid refresh token');
      }
      if (new Date(row.expiresAt as Date) < now()) {
        throw oauthError('INVALID_GRANT', 'Refresh token expired');
      }
      const { grant } = await options.grants.requireUsable(
        String(row.grantId),
        Number(row.grantRevision),
      );
      const scope = narrowedScope(String(row.scope), input.scope);
      const issued = await issueTokenPair({
        grantId: grant.id,
        clientId: grant.clientId,
        localUserId: grant.localUserId,
        scope,
        audience: grant.audience,
        grantRevision: grant.revision,
      });
      const revoked = await db()
        .updateTable('agentTokens')
        .set({ revokedAt: now(), rotatedToId: issued.refreshId })
        .where('id', '=', row.id as string)
        .where('revokedAt', 'is', null)
        .execute();
      if (revoked.updatedCount === 0) {
        throw oauthError('INVALID_GRANT', 'Refresh token already used');
      }
      return asTokenResponse(issued);
    },

    async revoke(input: {
      readonly clientId: string;
      readonly token: string;
      readonly tokenTypeHint?: string;
    }): Promise<void> {
      const digest = hashToken(input.token);
      const row = await db()
        .selectFrom('agentTokens')
        .selectAll()
        .where('digest', '=', digest)
        .where('clientId', '=', input.clientId)
        .executeTakeFirst();
      if (!row) return;
      await db()
        .updateTable('agentTokens')
        .set({ revokedAt: now() })
        .where('id', '=', row.id as string)
        .execute();
    },

    async resolveAccessToken(
      plaintext: string,
    ): Promise<ResolvedAccessToken | undefined> {
      if (!plaintext.startsWith(ACCESS_TOKEN_PREFIX)) return undefined;
      const digest = hashToken(plaintext);
      const row = await db()
        .selectFrom('agentTokens')
        .selectAll()
        .where('digest', '=', digest)
        .where('kind', '=', 'access')
        .executeTakeFirst();
      if (!row || row.revokedAt) return undefined;
      if (new Date(row.expiresAt as Date) < now()) return undefined;
      const expectedAudience = options.config().audience;
      if (expectedAudience && String(row.audience) !== expectedAudience) {
        return undefined;
      }
      const client = await options.clients.get(String(row.clientId));
      if (!client?.enabled) return undefined;
      const user = await db()
        .selectFrom('user')
        .select(['disabledAt'])
        .where('id', '=', String(row.localUserId))
        .executeTakeFirst();
      if (!user || user.disabledAt) return undefined;
      try {
        await options.grants.requireActive(
          String(row.grantId),
          Number(row.grantRevision),
        );
      } catch {
        return undefined;
      }
      return {
        tokenId: String(row.id),
        userId: String(row.localUserId),
        clientId: String(row.clientId),
        grantId: String(row.grantId),
        scope: String(row.scope),
        audience: String(row.audience),
        grantRevision: Number(row.grantRevision),
      };
    },
  };
}
