import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds Octop Agent Grants API connection fields on the catalog and the
 * operation/lock table used for create preflight, idempotency and audit.
 *
 * Shape is spelled out here rather than imported from a live collection
 * definition so a later schema change cannot alter what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'enterprise_app_portal_202611212000_add_agent_grants',

  async up({ builder }) {
    await builder.alterCollection(
      'enterprisePortalApplications',
      (collection) => {
        collection.boolean('agentGrantsEnabled', {
          nullable: false,
          defaultValue: false,
        });
        collection.string('apiBaseUrl', { length: 512 }).nullable();
        collection.string('apiAuthMode', { length: 32 }).nullable();
        collection.string('apiTokenEnv', { length: 128 }).nullable();
        collection.string('apiUsernameEnv', { length: 128 }).nullable();
        collection.string('apiPasswordEnv', { length: 128 }).nullable();
      },
    );

    await builder.createCollection(
      'enterprisePortalAgentGrantOperations',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('appCode', { length: 64 }).notNull();
        collection.string('casdoorUserId', { length: 128 }).notNull();
        collection.string('username', { length: 128 }).notNull();
        collection.string('actorUserId', { length: 64 }).notNull();
        collection.string('status', { length: 64 }).notNull();
        collection.string('expertTemplateId', { length: 128 }).nullable();
        collection.text('createOptionsSnapshot').notNull();
        collection.string('octopUserId', { length: 64 }).nullable();
        collection.string('agentId', { length: 64 }).nullable();
        collection.string('bootstrapStatus', { length: 64 }).nullable();
        collection.string('errorCode', { length: 128 }).nullable();
        collection.text('errorMessage').nullable();
        /** Non-null while the create is in flight; unique so one lock per app+user. */
        collection.string('lockKey', { length: 256 }).nullable();
        collection.datetime('startedAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.datetime('completedAt').nullable();

        collection.primary('id', {
          name: 'pk_enterprise_portal_agent_grant_ops',
        });
        collection.unique('lockKey', {
          name: 'uq_enterprise_portal_agent_grant_lock',
          mode: 'index',
        });
        collection.index(['appCode', 'casdoorUserId'], {
          name: 'idx_enterprise_portal_agent_grant_user',
        });
        collection.index('status', {
          name: 'idx_enterprise_portal_agent_grant_status',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('enterprisePortalAgentGrantOperations');
    await builder.alterCollection(
      'enterprisePortalApplications',
      (collection) => {
        collection.dropField('apiPasswordEnv');
        collection.dropField('apiUsernameEnv');
        collection.dropField('apiTokenEnv');
        collection.dropField('apiAuthMode');
        collection.dropField('apiBaseUrl');
        collection.dropField('agentGrantsEnabled');
      },
    );
  },
});

export default migration;
