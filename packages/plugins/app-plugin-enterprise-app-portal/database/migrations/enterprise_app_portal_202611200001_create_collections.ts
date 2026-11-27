import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the enterprise portal catalog, per-user launch preferences and append-only audit tables.
 *
 * Shape is spelled out here rather than imported from a live collection definition so a later
 * schema change cannot alter what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'enterprise_app_portal_202611200001_create_collections',

  async up({ builder }) {
    await builder.createCollection(
      'enterprisePortalApplications',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('appCode', { length: 64 }).notNull();
        collection.string('name', { length: 128 }).notNull();
        collection.string('appType', { length: 32 }).notNull();
        collection.string('businessCenter', { length: 128 }).nullable();
        collection.string('description', { length: 512 }).nullable();
        collection.string('icon', { length: 255 }).nullable();
        collection.string('baseUrl', { length: 512 }).notNull();
        collection.string('targetPath', { length: 512 }).notNull();
        collection.string('healthUrl', { length: 512 }).nullable();
        collection.string('casdoorAppKey', { length: 128 }).nullable();
        collection.boolean('enabled', { nullable: false, defaultValue: true });
        collection.integer('sortOrder', { nullable: false, defaultValue: 0 });
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', { name: 'pk_enterprise_portal_applications' });
        collection.unique('appCode', {
          name: 'uq_enterprise_portal_app_code',
          mode: 'index',
        });
      },
    );

    await builder.createCollection(
      'enterprisePortalUserPreferences',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('userId', { length: 64 }).notNull();
        collection.string('autoLaunchMode', { length: 32 }).notNull();
        collection.string('defaultAppCode', { length: 64 }).nullable();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', {
          name: 'pk_enterprise_portal_user_preferences',
        });
        collection.unique('userId', {
          name: 'uq_enterprise_portal_user_prefs',
          mode: 'index',
        });
      },
    );

    await builder.createCollection(
      'enterprisePortalAuditEvents',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('actorUserId', { length: 64 }).nullable();
        collection.string('appCode', { length: 64 }).nullable();
        collection.string('action', { length: 64 }).notNull();
        collection.string('result', { length: 32 }).notNull();
        collection.string('reason', { length: 128 }).nullable();
        collection.text('metadata').nullable();
        collection.datetime('createdAt').notNull();

        collection.primary('id', { name: 'pk_enterprise_portal_audit_events' });
        collection.index('createdAt', {
          name: 'idx_enterprise_portal_audit_created',
        });
        collection.index('actorUserId', {
          name: 'idx_enterprise_portal_audit_actor',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('enterprisePortalAuditEvents');
    await builder.dropCollection('enterprisePortalUserPreferences');
    await builder.dropCollection('enterprisePortalApplications');
  },
});

export default migration;
