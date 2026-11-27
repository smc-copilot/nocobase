import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Per-Octop-instance gate for `POST …/install?as_user=`. Older Octop builds
 * ignore unknown query params and install under the admin actor, so the flag
 * defaults to false until an operator verifies the target instance.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'enterprise_app_portal_202611222100_supports_install_as_user',

  async up({ builder }) {
    await builder.alterCollection(
      'enterprisePortalApplications',
      (collection) => {
        collection.boolean('supportsInstallAsUser', {
          nullable: false,
          defaultValue: false,
        });
      },
    );
  },

  async down({ builder }) {
    await builder.alterCollection(
      'enterprisePortalApplications',
      (collection) => {
        collection.dropField('supportsInstallAsUser');
      },
    );
  },
});

export default migration;
