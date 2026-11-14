import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * NEXT-03: store binding revision + form config version on embed contexts, and
 * invalidate unconsumed tickets / live embeds that lack nonce or a numeric
 * binding revision (legacy rows that stored binding.id). Formal records,
 * operations, receipts and audit rows are preserved.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611140002_binding_revision_and_stale_invalidation',

  async up({ builder, query }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.string('bindingRevision', { length: 64 }).nullable();
      collection.string('formConfigVersion', { length: 128 }).nullable();
      collection.string('subjectBindingId', { length: 64 }).nullable();
    });

    const invalidatedAt = new Date();

    // Tickets without nonce or whose bindingRevision is missing / non-numeric
    // are treated as legacy and consumed so they cannot be redeemed.
    const staleTickets = await query
      .selectFrom('businessUiTickets')
      .select(['id'])
      .where('consumedAt', 'is', null)
      .execute();
    let ticketsInvalidated = 0;
    for (const row of staleTickets) {
      const full = await query
        .selectFrom('businessUiTickets')
        .select(['id', 'nonce', 'bindingRevision'])
        .where('id', '=', row.id as string)
        .executeTakeFirst();
      if (!full) continue;
      const revision = full.bindingRevision as string | null;
      const nonce = full.nonce as string | null;
      const numericRevision = revision != null && /^\d+$/.test(revision);
      if (!nonce || !numericRevision) {
        await query
          .updateTable('businessUiTickets')
          .set({ consumedAt: invalidatedAt })
          .where('id', '=', full.id as string)
          .where('consumedAt', 'is', null)
          .execute();
        ticketsInvalidated += 1;
      }
    }

    // Embeds without nonce expire immediately (cannot continue save/submit).
    const staleEmbeds = await query
      .selectFrom('businessUiEmbedContexts')
      .select(['id', 'nonce', 'expiresAt'])
      .execute();
    let embedsInvalidated = 0;
    for (const row of staleEmbeds) {
      if (row.nonce) continue;
      await query
        .updateTable('businessUiEmbedContexts')
        .set({ expiresAt: invalidatedAt })
        .where('id', '=', row.id as string)
        .execute();
      embedsInvalidated += 1;
    }

    // Anonymized invalidation report (counts only; no ticket/user identifiers).
    // Written to the Casdoor identity audit log when that collection is present.
    try {
      await query
        .insertInto('identityAuditEvents')
        .values({
          id: `mig-stale-${invalidatedAt.getTime()}`,
          action: 'stale_credential_invalidation',
          actorId: null,
          targetType: 'migration',
          targetId: 'business_ui_adapter_202611140002',
          details: {
            ticketsInvalidated,
            embedsInvalidated,
            reason: 'missing_nonce_or_numeric_binding_revision',
          },
          createdAt: invalidatedAt,
        })
        .execute();
    } catch {
      // Identity plugin may not be installed in adapter-only test harnesses.
    }
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.dropField('subjectBindingId');
      collection.dropField('formConfigVersion');
      collection.dropField('bindingRevision');
    });
  },
});

export default migration;
