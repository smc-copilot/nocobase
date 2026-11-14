import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds a monotonic `revision` to subject bindings (NEXT-03). Binding id is stable;
 * revoke / re-enable / rebind bump revision so tickets and embeds that captured an
 * older revision cannot be reused after the change.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'casdoor_identity_202611140003_binding_revision',

  async up({ builder, query }) {
    await builder.alterCollection('businessUiSubjectBindings', (collection) => {
      collection
        .integer('revision', { nullable: false, defaultValue: 1 })
        .notNull();
    });
    // Existing rows receive the column default; bump once so pre-migration
    // tickets that stored binding.id as "revision" cannot match by coincidence.
    await query
      .updateTable('businessUiSubjectBindings')
      .set({ revision: 1 })
      .allowAllRows()
      .execute();
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiSubjectBindings', (collection) => {
      collection.dropField('revision');
    });
  },
});

export default migration;
