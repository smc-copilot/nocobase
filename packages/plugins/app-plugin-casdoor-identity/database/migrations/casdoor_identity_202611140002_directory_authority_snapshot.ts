import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds directory-authority attribute snapshots on `externalIdentities` (I02).
 *
 * After the first successful directory sync, Permission Set mapping on login uses these
 * fields instead of JWT claims so a stale access token cannot re-grant revoked groups.
 * `casdoor_identity_202611140001_create_iam_sync_collections` is left untouched.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'casdoor_identity_202611140002_directory_authority_snapshot',

  async up({ builder }) {
    await builder.alterCollection('externalIdentities', (collection) => {
      // Raw directory attributes observed at the last successful sync (JSON object).
      collection.json('directoryAttributes').nullable();
      // Wall-clock time of that observation; null until the first directory sync.
      collection.datetime('directoryObservedAt').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('externalIdentities', (collection) => {
      collection.dropField('directoryObservedAt');
      collection.dropField('directoryAttributes');
    });
  },
});

export default migration;
