import type { DatabaseManager } from '@nocobase/db';

import type { AgentAuthorizationConfig } from '../config.js';

export type AuthMethod = 'client_secret_post' | 'client_secret_basic';

export interface AgentClientRow {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly instanceLabel: string | null;
  readonly secretHash: string;
  readonly authMethod: AuthMethod;
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly enabled: boolean;
  readonly secretVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentClientView {
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly instanceLabel: string | null;
  readonly authMethod: AuthMethod;
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly enabled: boolean;
  readonly secretVersion: number;
  readonly hasSecret: true;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentClientCreated extends AgentClientView {
  readonly clientSecret: string;
}

export interface AgentGrantRow {
  readonly id: string;
  readonly clientId: string;
  readonly localUserId: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly revision: number;
  readonly status: 'active' | 'revoked';
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentGrantView {
  readonly grantId: string;
  readonly clientId: string;
  readonly clientName?: string;
  readonly localUserId: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly revision: number;
  readonly status: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResolvedAccessToken {
  readonly tokenId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly grantId: string;
  readonly scope: string;
  readonly audience: string;
  readonly grantRevision: number;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
}

export interface CreateClientInput {
  readonly name: string;
  readonly description?: string | null;
  readonly instanceLabel?: string | null;
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly authMethod?: AuthMethod;
  readonly enabled?: boolean;
}

export interface UpdateClientInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly instanceLabel?: string | null;
  readonly redirectUris?: readonly string[];
  readonly allowedScopes?: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly enabled?: boolean;
}

export interface AgentAuthorizationServices {
  readonly clients: {
    create(input: CreateClientInput): Promise<AgentClientCreated>;
    list(): Promise<readonly AgentClientView[]>;
    get(clientId: string): Promise<AgentClientView | undefined>;
    update(
      clientId: string,
      input: UpdateClientInput,
    ): Promise<AgentClientView>;
    rotateSecret(clientId: string): Promise<AgentClientCreated>;
    authenticate(clientId: string, secret: string): Promise<AgentClientRow>;
  };
  readonly grants: {
    createOrReuse(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly audience: string;
      readonly scopes: readonly string[];
    }): Promise<AgentGrantRow>;
    findActiveCovering(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly audience: string;
      readonly scopes: readonly string[];
    }): Promise<AgentGrantRow | undefined>;
    requireActive(
      grantId: string,
      expectedRevision?: number,
    ): Promise<AgentGrantRow>;
    /**
     * Active grant whose client is enabled and whose local user is not disabled.
     * Does not revive tokens; callers still honor `revokedAt` on each token.
     */
    requireUsable(
      grantId: string,
      expectedRevision?: number,
    ): Promise<{
      readonly grant: AgentGrantRow;
      readonly client: AgentClientRow;
    }>;
    listForUser(localUserId: string): Promise<readonly AgentGrantView[]>;
    listAdmin(filter?: {
      readonly clientId?: string;
      readonly localUserId?: string;
    }): Promise<readonly AgentGrantView[]>;
    revoke(grantId: string, actorUserId?: string): Promise<AgentGrantView>;
  };
  readonly oauth: {
    createAuthorizationCode(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly grantId: string;
      readonly redirectUri: string;
      readonly codeChallenge: string;
      readonly scope: string;
    }): Promise<string>;
    exchangeAuthorizationCode(input: {
      readonly clientId: string;
      readonly code: string;
      readonly redirectUri: string;
      readonly codeVerifier: string;
    }): Promise<TokenResponse>;
    refresh(input: {
      readonly clientId: string;
      readonly refreshToken: string;
      readonly scope?: string;
    }): Promise<TokenResponse>;
    revoke(input: {
      readonly clientId: string;
      readonly token: string;
      readonly tokenTypeHint?: string;
    }): Promise<void>;
    resolveAccessToken(
      plaintext: string,
    ): Promise<ResolvedAccessToken | undefined>;
  };
  readonly audit: {
    record(input: {
      readonly clientId?: string | null;
      readonly localUserId?: string | null;
      readonly grantId?: string | null;
      readonly action: string;
      readonly decision: string;
      readonly reason?: string | null;
      readonly details?: Record<string, unknown>;
    }): Promise<void>;
    list(limit?: number): Promise<readonly Record<string, unknown>[]>;
  };
  readonly config: () => AgentAuthorizationConfig;
}

export interface CreateServicesOptions {
  readonly database: () => DatabaseManager;
  readonly config: () => AgentAuthorizationConfig;
  readonly defaultAudience: () => string;
}
