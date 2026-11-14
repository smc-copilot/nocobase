import type { DatabaseManager } from '@nocobase/db';

import { readEpoch } from './epochs.js';

function now(): Date {
  return new Date();
}

/**
 * User-disable revocation. Bumps `credentialEpoch` on every grant for the user,
 * then revokes their tokens and consumes unused authorization codes.
 * Re-enabling the user does not move the epoch back, so old credentials stay dead.
 */
export function createLifecycleService(database: () => DatabaseManager) {
  const db = () => database().connection().query;

  return {
    async revokeUser(userId: string): Promise<void> {
      const updatedAt = now();
      const grants = await db()
        .selectFrom('agentGrants')
        .select(['id', 'credentialEpoch'])
        .where('localUserId', '=', userId)
        .execute();
      for (const grant of grants) {
        const current = readEpoch(grant.credentialEpoch) ?? 1;
        await db()
          .updateTable('agentGrants')
          .set({ credentialEpoch: current + 1, updatedAt })
          .where('id', '=', String(grant.id))
          .execute();
      }
      await db()
        .updateTable('agentTokens')
        .set({ revokedAt: updatedAt })
        .where('localUserId', '=', userId)
        .where('revokedAt', 'is', null)
        .execute();
      await db()
        .updateTable('agentAuthCodes')
        .set({ consumedAt: updatedAt })
        .where('localUserId', '=', userId)
        .where('consumedAt', 'is', null)
        .execute();
    },
  };
}
