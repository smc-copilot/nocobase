import type { DatabaseManager } from '@nocobase/db';

import { SCOPES } from '../config.js';
import {
  hashClientSecret,
  randomId,
  randomSecret,
  secretsEqual,
} from '../crypto.js';
import { oauthError } from './errors.js';
import type {
  AgentClientCreated,
  AgentClientRow,
  AgentClientView,
  AuthMethod,
  CreateClientInput,
  UpdateClientInput,
} from './types.js';

function now(): Date {
  return new Date();
}

function asStringArray(value: unknown): string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === 'string');
}

function toRow(record: Record<string, unknown>): AgentClientRow {
  return {
    id: String(record.id),
    clientId: String(record.clientId),
    name: String(record.name),
    description:
      typeof record.description === 'string' ? record.description : null,
    instanceLabel:
      typeof record.instanceLabel === 'string' ? record.instanceLabel : null,
    secretHash: String(record.secretHash),
    authMethod: String(record.authMethod) as AuthMethod,
    redirectUris: asStringArray(record.redirectUris),
    allowedScopes: asStringArray(record.allowedScopes),
    allowedOrigins: asStringArray(record.allowedOrigins),
    enabled:
      record.enabled === true || record.enabled === 1 || record.enabled === '1',
    secretVersion: Number(record.secretVersion ?? 1),
    createdAt: new Date(record.createdAt as Date),
    updatedAt: new Date(record.updatedAt as Date),
  };
}

function toView(row: AgentClientRow): AgentClientView {
  return {
    clientId: row.clientId,
    name: row.name,
    description: row.description,
    instanceLabel: row.instanceLabel,
    authMethod: row.authMethod,
    redirectUris: row.redirectUris,
    allowedScopes: row.allowedScopes,
    allowedOrigins: row.allowedOrigins,
    enabled: row.enabled,
    secretVersion: row.secretVersion,
    hasSecret: true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateScopes(scopes: readonly string[]): void {
  const allowed = new Set<string>(SCOPES);
  for (const scope of scopes) {
    if (!allowed.has(scope)) {
      throw oauthError('INVALID_SCOPE', `Unsupported scope: ${scope}`);
    }
  }
}

export function createClientService(database: () => DatabaseManager) {
  const db = () => database().connection().query;

  async function load(clientId: string): Promise<AgentClientRow | undefined> {
    const row = await db()
      .selectFrom('agentClients')
      .selectAll()
      .where('clientId', '=', clientId)
      .executeTakeFirst();
    return row ? toRow(row) : undefined;
  }

  return {
    async create(input: CreateClientInput): Promise<AgentClientCreated> {
      if (!input.redirectUris.length) {
        throw oauthError(
          'INVALID_REQUEST',
          'At least one redirect URI is required',
        );
      }
      validateScopes(input.allowedScopes);
      const plaintext = randomSecret();
      const createdAt = now();
      const clientId = randomId('client');
      const id = randomId('ac');
      await db()
        .insertInto('agentClients')
        .values({
          id,
          clientId,
          name: input.name,
          description: input.description ?? null,
          instanceLabel: input.instanceLabel ?? null,
          secretHash: hashClientSecret(plaintext),
          authMethod: input.authMethod ?? 'client_secret_post',
          redirectUris: [...input.redirectUris],
          allowedScopes: [...input.allowedScopes],
          allowedOrigins: [...(input.allowedOrigins ?? [])],
          enabled: input.enabled ?? true,
          secretVersion: 1,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
      const row = (await load(clientId))!;
      return { ...toView(row), clientSecret: plaintext };
    },

    async list(): Promise<readonly AgentClientView[]> {
      const rows = await db().selectFrom('agentClients').selectAll().execute();
      return rows.map((row) => toView(toRow(row as Record<string, unknown>)));
    },

    async get(clientId: string): Promise<AgentClientView | undefined> {
      const row = await load(clientId);
      return row ? toView(row) : undefined;
    },

    async update(
      clientId: string,
      input: UpdateClientInput,
    ): Promise<AgentClientView> {
      const existing = await load(clientId);
      if (!existing) {
        throw oauthError('NOT_FOUND', 'Client not found', 'NOT_FOUND');
      }
      if (input.allowedScopes) validateScopes(input.allowedScopes);
      const updatedAt = now();
      const disabling = input.enabled === false && existing.enabled;
      await db()
        .updateTable('agentClients')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.instanceLabel !== undefined
            ? { instanceLabel: input.instanceLabel }
            : {}),
          ...(input.redirectUris
            ? { redirectUris: [...input.redirectUris] }
            : {}),
          ...(input.allowedScopes
            ? { allowedScopes: [...input.allowedScopes] }
            : {}),
          ...(input.allowedOrigins
            ? { allowedOrigins: [...input.allowedOrigins] }
            : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          updatedAt,
        })
        .where('clientId', '=', clientId)
        .execute();
      if (disabling) {
        await db()
          .updateTable('agentTokens')
          .set({ revokedAt: updatedAt })
          .where('clientId', '=', clientId)
          .where('revokedAt', 'is', null)
          .execute();
      }
      return toView((await load(clientId))!);
    },

    async rotateSecret(clientId: string): Promise<AgentClientCreated> {
      const existing = await load(clientId);
      if (!existing) {
        throw oauthError('NOT_FOUND', 'Client not found', 'NOT_FOUND');
      }
      const plaintext = randomSecret();
      const updatedAt = now();
      await db()
        .updateTable('agentClients')
        .set({
          secretHash: hashClientSecret(plaintext),
          secretVersion: existing.secretVersion + 1,
          updatedAt,
        })
        .where('clientId', '=', clientId)
        .execute();
      const row = (await load(clientId))!;
      return { ...toView(row), clientSecret: plaintext };
    },

    async authenticate(
      clientId: string,
      secret: string,
    ): Promise<AgentClientRow> {
      const row = await load(clientId);
      const stored = row?.secretHash ?? hashClientSecret('missing-client');
      const matches = secretsEqual(stored, hashClientSecret(secret));
      if (!row || !matches) {
        throw oauthError(
          'INVALID_CLIENT',
          'Client authentication failed',
          'UNAUTHENTICATED',
        );
      }
      if (!row.enabled) {
        throw oauthError(
          'UNAUTHORIZED_CLIENT',
          'Client is disabled',
          'PERMISSION_DENIED',
        );
      }
      return row;
    },
  };
}
