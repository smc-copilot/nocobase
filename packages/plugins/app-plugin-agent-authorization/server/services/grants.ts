import type { DatabaseManager } from '@nocobase/db';

import { randomId } from '../crypto.js';
import { oauthError } from './errors.js';
import type {
  AgentClientRow,
  AgentGrantRow,
  AgentGrantView,
  AuthMethod,
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

function toRow(record: Record<string, unknown>): AgentGrantRow {
  return {
    id: String(record.id),
    clientId: String(record.clientId),
    localUserId: String(record.localUserId),
    audience: String(record.audience),
    scopes: asStringArray(record.scopes),
    revision: Number(record.revision ?? 1),
    status: String(record.status) === 'revoked' ? 'revoked' : 'active',
    expiresAt: record.expiresAt ? new Date(record.expiresAt as Date) : null,
    lastUsedAt: record.lastUsedAt ? new Date(record.lastUsedAt as Date) : null,
    revokedAt: record.revokedAt ? new Date(record.revokedAt as Date) : null,
    createdAt: new Date(record.createdAt as Date),
    updatedAt: new Date(record.updatedAt as Date),
  };
}

function covers(
  granted: readonly string[],
  requested: readonly string[],
): boolean {
  const set = new Set(granted);
  return requested.every((scope) => set.has(scope));
}

function toClientRow(record: Record<string, unknown>): AgentClientRow {
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

function toView(row: AgentGrantRow, clientName?: string): AgentGrantView {
  return {
    grantId: row.id,
    clientId: row.clientId,
    ...(clientName !== undefined ? { clientName } : {}),
    localUserId: row.localUserId,
    audience: row.audience,
    scopes: row.scopes,
    revision: row.revision,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createGrantService(database: () => DatabaseManager) {
  const db = () => database().connection().query;

  async function load(grantId: string): Promise<AgentGrantRow | undefined> {
    const row = await db()
      .selectFrom('agentGrants')
      .selectAll()
      .where('id', '=', grantId)
      .executeTakeFirst();
    return row ? toRow(row) : undefined;
  }

  async function findActiveCovering(input: {
    readonly clientId: string;
    readonly localUserId: string;
    readonly audience: string;
    readonly scopes: readonly string[];
  }): Promise<AgentGrantRow | undefined> {
    const rows = await db()
      .selectFrom('agentGrants')
      .selectAll()
      .where('clientId', '=', input.clientId)
      .where('localUserId', '=', input.localUserId)
      .where('audience', '=', input.audience)
      .where('status', '=', 'active')
      .execute();
    for (const raw of rows) {
      const row = toRow(raw);
      if (row.expiresAt && row.expiresAt < now()) continue;
      if (covers(row.scopes, input.scopes)) return row;
    }
    return undefined;
  }

  async function requireActiveGrant(
    grantId: string,
    expectedRevision?: number,
  ): Promise<AgentGrantRow> {
    const row = await load(grantId);
    if (!row || row.status !== 'active') {
      throw oauthError(
        'INVALID_GRANT',
        'Grant is missing or revoked',
        'PERMISSION_DENIED',
      );
    }
    if (row.expiresAt && row.expiresAt < now()) {
      throw oauthError(
        'INVALID_GRANT',
        'Grant has expired',
        'PERMISSION_DENIED',
      );
    }
    if (expectedRevision !== undefined && row.revision !== expectedRevision) {
      throw oauthError(
        'INVALID_GRANT',
        'Grant revision changed',
        'PERMISSION_DENIED',
      );
    }
    return row;
  }

  return {
    async createOrReuse(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly audience: string;
      readonly scopes: readonly string[];
    }): Promise<AgentGrantRow> {
      const existing = await findActiveCovering(input);
      if (existing) {
        await db()
          .updateTable('agentGrants')
          .set({ lastUsedAt: now(), updatedAt: now() })
          .where('id', '=', existing.id)
          .execute();
        return (await load(existing.id))!;
      }
      const activeRows = await db()
        .selectFrom('agentGrants')
        .selectAll()
        .where('clientId', '=', input.clientId)
        .where('localUserId', '=', input.localUserId)
        .where('audience', '=', input.audience)
        .where('status', '=', 'active')
        .execute();
      const expandable = activeRows
        .map((raw) => toRow(raw as Record<string, unknown>))
        .find((row) => !row.expiresAt || row.expiresAt >= now());
      if (expandable) {
        const scopes = [...new Set([...expandable.scopes, ...input.scopes])];
        const updatedAt = now();
        await db()
          .updateTable('agentGrants')
          .set({ scopes, lastUsedAt: updatedAt, updatedAt })
          .where('id', '=', expandable.id)
          .execute();
        return (await load(expandable.id))!;
      }
      const createdAt = now();
      const id = randomId('grant');
      await db()
        .insertInto('agentGrants')
        .values({
          id,
          clientId: input.clientId,
          localUserId: input.localUserId,
          audience: input.audience,
          scopes: [...input.scopes],
          revision: 1,
          status: 'active',
          expiresAt: null,
          lastUsedAt: createdAt,
          revokedAt: null,
          createdAt,
          updatedAt: createdAt,
        })
        .execute();
      return (await load(id))!;
    },

    findActiveCovering(input: {
      readonly clientId: string;
      readonly localUserId: string;
      readonly audience: string;
      readonly scopes: readonly string[];
    }): Promise<AgentGrantRow | undefined> {
      return findActiveCovering(input);
    },

    async requireActive(
      grantId: string,
      expectedRevision?: number,
    ): Promise<AgentGrantRow> {
      return requireActiveGrant(grantId, expectedRevision);
    },

    async requireUsable(
      grantId: string,
      expectedRevision?: number,
    ): Promise<{
      readonly grant: AgentGrantRow;
      readonly client: AgentClientRow;
    }> {
      const grant = await requireActiveGrant(grantId, expectedRevision);
      const clientRaw = await db()
        .selectFrom('agentClients')
        .selectAll()
        .where('clientId', '=', grant.clientId)
        .executeTakeFirst();
      if (!clientRaw) {
        throw oauthError(
          'UNAUTHORIZED_CLIENT',
          'Client is missing',
          'PERMISSION_DENIED',
        );
      }
      const client = toClientRow(clientRaw);
      if (!client.enabled) {
        throw oauthError(
          'UNAUTHORIZED_CLIENT',
          'Client is disabled',
          'PERMISSION_DENIED',
        );
      }
      const user = await db()
        .selectFrom('user')
        .select(['disabledAt'])
        .where('id', '=', grant.localUserId)
        .executeTakeFirst();
      if (!user || user.disabledAt) {
        throw oauthError(
          'INVALID_GRANT',
          'User is disabled',
          'PERMISSION_DENIED',
        );
      }
      return { grant, client };
    },

    async listForUser(localUserId: string): Promise<readonly AgentGrantView[]> {
      const rows = await db()
        .selectFrom('agentGrants')
        .selectAll()
        .where('localUserId', '=', localUserId)
        .orderBy('updatedAt', 'desc')
        .execute();
      const views: AgentGrantView[] = [];
      for (const raw of rows) {
        const row = toRow(raw);
        const client = await db()
          .selectFrom('agentClients')
          .select(['name'])
          .where('clientId', '=', row.clientId)
          .executeTakeFirst();
        views.push(
          toView(
            row,
            client ? String((client as { name: string }).name) : undefined,
          ),
        );
      }
      return views;
    },

    async listAdmin(filter?: {
      readonly clientId?: string;
      readonly localUserId?: string;
    }): Promise<readonly AgentGrantView[]> {
      let query = db().selectFrom('agentGrants').selectAll();
      if (filter?.clientId) {
        query = query.where('clientId', '=', filter.clientId);
      }
      if (filter?.localUserId) {
        query = query.where('localUserId', '=', filter.localUserId);
      }
      const rows = await query.orderBy('updatedAt', 'desc').execute();
      return rows.map((raw) => toView(toRow(raw as Record<string, unknown>)));
    },

    async revoke(
      grantId: string,
      _actorUserId?: string,
    ): Promise<AgentGrantView> {
      const existing = await load(grantId);
      if (!existing) {
        throw oauthError('NOT_FOUND', 'Grant not found', 'NOT_FOUND');
      }
      const updatedAt = now();
      await db()
        .updateTable('agentGrants')
        .set({
          status: 'revoked',
          revision: existing.revision + 1,
          revokedAt: updatedAt,
          updatedAt,
        })
        .where('id', '=', grantId)
        .execute();
      await db()
        .updateTable('agentTokens')
        .set({ revokedAt: updatedAt })
        .where('grantId', '=', grantId)
        .where('revokedAt', 'is', null)
        .execute();
      return toView((await load(grantId))!);
    },
  };
}
