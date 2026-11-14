import type { DatabaseManager } from '@nocobase/db';

import { randomId } from '../crypto.js';

function now(): Date {
  return new Date();
}

export function createAuditService(database: () => DatabaseManager) {
  const db = () => database().connection().query;

  return {
    async record(input: {
      readonly clientId?: string | null;
      readonly localUserId?: string | null;
      readonly grantId?: string | null;
      readonly action: string;
      readonly decision: string;
      readonly reason?: string | null;
      readonly details?: Record<string, unknown>;
    }): Promise<void> {
      await db()
        .insertInto('agentAuditEvents')
        .values({
          id: randomId('audit'),
          clientId: input.clientId ?? null,
          localUserId: input.localUserId ?? null,
          grantId: input.grantId ?? null,
          action: input.action,
          decision: input.decision,
          reason: input.reason ?? null,
          details: input.details ?? {},
          createdAt: now(),
        })
        .execute();
    },

    async list(limit = 100): Promise<readonly Record<string, unknown>[]> {
      const rows = await db()
        .selectFrom('agentAuditEvents')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .limit(Math.min(Math.max(limit, 1), 500))
        .execute();
      return rows;
    },
  };
}
