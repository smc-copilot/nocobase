import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops embed rows whose scope snapshot is missing, and tickets whose context
 * has no string-array `scopes`. Those rows cannot prove the token scope they
 * were issued with, and must not fall back to the current grant. Ticket scopes
 * live inside JSON, so the delete selects ids in this migration rather than a
 * dialect-specific JSON predicate. Epoch columns stay null on surviving embeds;
 * a null epoch is not a current one. Business documents, interactions, receipts,
 * and users are left in place.
 */
function usableScopeList(value: unknown): boolean {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const scopes = (parsed as { scopes?: unknown }).scopes;
  let list: unknown = scopes;
  if (typeof scopes === 'string') {
    try {
      list = JSON.parse(scopes) as unknown;
    } catch {
      return false;
    }
  }
  return (
    Array.isArray(list) && list.every((entry) => typeof entry === 'string')
  );
}

const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611170001_invalidate_unscoped_and_epochs',

  async up({ builder, query }) {
    await query
      .deleteFrom('businessUiEmbedContexts')
      .where('scopes', 'is', null)
      .execute();
    const tickets = await query
      .selectFrom('businessUiTickets')
      .select(['id', 'context'])
      .execute();
    const staleTicketIds = tickets
      .filter((row) => !usableScopeList(row.context))
      .map((row) => String(row.id));
    if (staleTicketIds.length > 0) {
      await query
        .deleteFrom('businessUiTickets')
        .where('id', 'in', staleTicketIds)
        .execute();
    }
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.integer('clientEpoch').nullable();
      collection.integer('credentialEpoch').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.dropField('credentialEpoch');
      collection.dropField('clientEpoch');
    });
  },
});

export default migration;
