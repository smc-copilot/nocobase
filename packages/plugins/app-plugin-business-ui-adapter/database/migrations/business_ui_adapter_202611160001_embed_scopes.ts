import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Stores the grant ∩ token ∩ client scope intersection on an embed.
 * Null means the row predates this column. Readers fall back to the current
 * grant scopes intersected with the client's current allowed scopes.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611160001_embed_scopes',

  async up({ builder }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.json('scopes').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.dropField('scopes');
    });
  },
});

export default migration;
