import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the external identity binding table used by the Casdoor credential resolver.
 *
 * Shape is spelled out here rather than imported from a live collection definition so a later
 * schema change cannot alter what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'casdoor_identity_202611130001_create_external_identities',

  async up({ builder }) {
    await builder.createCollection('externalIdentities', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('providerIssuer', { length: 512 }).notNull();
      collection.string('providerSubject', { length: 255 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.datetime('lastSyncedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_external_identities' });
      collection.unique(['providerIssuer', 'providerSubject'], {
        name: 'uq_external_identities_issuer_subject',
        mode: 'index',
      });
      collection.index('localUserId', { name: 'idx_external_identities_user' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('externalIdentities');
  },
});

export default migration;
