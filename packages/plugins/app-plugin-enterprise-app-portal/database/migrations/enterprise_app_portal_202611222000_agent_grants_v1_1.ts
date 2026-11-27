import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Extends agent grant operations for multi-expert install tracking and adds
 * per-template expert item rows. Shape is self-contained so later collection
 * edits cannot change what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'enterprise_app_portal_202611222000_agent_grants_v1_1',

  async up({ builder }) {
    await builder.alterCollection(
      'enterprisePortalAgentGrantOperations',
      (collection) => {
        collection.string('operationMode', { length: 32 }).nullable();
        collection.integer('selectedExpertCount', {
          nullable: false,
          defaultValue: 0,
        });
        collection.integer('completedExpertCount', {
          nullable: false,
          defaultValue: 0,
        });
        collection.integer('failedExpertCount', {
          nullable: false,
          defaultValue: 0,
        });
        collection.integer('skippedExpertCount', {
          nullable: false,
          defaultValue: 0,
        });
      },
    );

    await builder.createCollection(
      'enterprisePortalAgentGrantExpertItems',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('operationId', { length: 64 }).notNull();
        collection.string('expertTemplateId', { length: 128 }).notNull();
        collection.string('expertName', { length: 255 }).notNull();
        collection.string('status', { length: 64 }).notNull();
        collection.string('agentId', { length: 64 }).nullable();
        collection.boolean('bootstrapPending').nullable();
        collection.string('errorCode', { length: 128 }).nullable();
        collection.text('errorMessage').nullable();
        collection.datetime('startedAt').nullable();
        collection.datetime('completedAt').nullable();

        collection.primary('id', {
          name: 'pk_enterprise_portal_agent_grant_expert_items',
        });
        collection.unique(['operationId', 'expertTemplateId'], {
          name: 'uq_enterprise_portal_agent_grant_expert_item',
          mode: 'index',
        });
        collection.index('operationId', {
          name: 'idx_enterprise_portal_agent_grant_expert_op',
        });
        collection.index('status', {
          name: 'idx_enterprise_portal_agent_grant_expert_status',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('enterprisePortalAgentGrantExpertItems');
    await builder.alterCollection(
      'enterprisePortalAgentGrantOperations',
      (collection) => {
        collection.dropField('skippedExpertCount');
        collection.dropField('failedExpertCount');
        collection.dropField('completedExpertCount');
        collection.dropField('selectedExpertCount');
        collection.dropField('operationMode');
      },
    );
  },
});

export default migration;
