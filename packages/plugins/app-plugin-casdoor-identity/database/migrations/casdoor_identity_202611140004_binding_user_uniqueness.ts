import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * NEXT-05 / N25: one active Octop binding per (connectionId, localUserId).
 * `activeLocalUserId` mirrors `localUserId` while status is active and is null
 * when revoked, so a unique index on (connectionId, activeLocalUserId) only
 * constrains live bindings (SQL unique indexes allow multiple NULLs).
 */
const migration: MigrationDefinition = defineMigration({
  name: 'casdoor_identity_202611140004_binding_user_uniqueness',

  async up({ builder, query }) {
    await builder.alterCollection('businessUiSubjectBindings', (collection) => {
      collection.string('activeLocalUserId', { length: 64 }).nullable();
    });

    const active = await query
      .selectFrom('businessUiSubjectBindings')
      .select(['id', 'localUserId'])
      .where('status', '=', 'active')
      .execute();
    for (const row of active) {
      await query
        .updateTable('businessUiSubjectBindings')
        .set({ activeLocalUserId: row.localUserId })
        .where('id', '=', row.id)
        .execute();
    }

    await builder.alterCollection('businessUiSubjectBindings', (collection) => {
      collection.unique(['connectionId', 'activeLocalUserId'], {
        name: 'uq_business_ui_subject_bindings_connection_active_user',
        mode: 'index',
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiSubjectBindings', (collection) => {
      collection.dropIndex(
        'uq_business_ui_subject_bindings_connection_active_user',
      );
      collection.dropField('activeLocalUserId');
    });
  },
});

export default migration;
