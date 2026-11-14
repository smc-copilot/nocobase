import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates Agent Authorization collections for client registry, user grants,
 * authorization codes, opaque tokens, and audit events.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'agent_authorization_202611150001_create_collections',

  async up({ builder }) {
    await builder.createCollection('agentClients', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('clientId', { length: 128 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('description', { length: 1024 }).nullable();
      collection.string('instanceLabel', { length: 255 }).nullable();
      collection.string('secretHash', { length: 128 }).notNull();
      collection.string('authMethod', { length: 64 }).notNull();
      collection.json('redirectUris').notNull();
      collection.json('allowedScopes').notNull();
      collection.json('allowedOrigins').notNull();
      collection.boolean('enabled').notNull();
      collection.integer('secretVersion').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_agent_clients' });
      collection.unique('clientId', {
        name: 'uq_agent_clients_client_id',
        mode: 'index',
      });
    });

    await builder.createCollection('agentGrants', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('clientId', { length: 128 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('audience', { length: 512 }).notNull();
      collection.json('scopes').notNull();
      collection.integer('revision').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('expiresAt').nullable();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('revokedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_agent_grants' });
      collection.index(['clientId', 'localUserId'], {
        name: 'idx_agent_grants_client_user',
      });
      collection.index('status', { name: 'idx_agent_grants_status' });
    });

    await builder.createCollection('agentAuthCodes', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('digest', { length: 128 }).notNull();
      collection.string('clientId', { length: 128 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('grantId', { length: 64 }).notNull();
      collection.string('redirectUri', { length: 1024 }).notNull();
      collection.string('codeChallenge', { length: 128 }).notNull();
      collection.string('scope', { length: 512 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('consumedAt').nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_agent_auth_codes' });
      collection.unique('digest', {
        name: 'uq_agent_auth_codes_digest',
        mode: 'index',
      });
      collection.index('clientId', { name: 'idx_agent_auth_codes_client' });
    });

    await builder.createCollection('agentTokens', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('digest', { length: 128 }).notNull();
      collection.string('grantId', { length: 64 }).notNull();
      collection.string('clientId', { length: 128 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('kind', { length: 32 }).notNull();
      collection.string('scope', { length: 512 }).notNull();
      collection.string('audience', { length: 512 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('revokedAt').nullable();
      collection.string('rotatedToId', { length: 64 }).nullable();
      collection.integer('grantRevision').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_agent_tokens' });
      collection.unique('digest', {
        name: 'uq_agent_tokens_digest',
        mode: 'index',
      });
      collection.index('grantId', { name: 'idx_agent_tokens_grant' });
      collection.index(['clientId', 'kind'], {
        name: 'idx_agent_tokens_client_kind',
      });
    });

    await builder.createCollection('agentAuditEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('clientId', { length: 128 }).nullable();
      collection.string('localUserId', { length: 64 }).nullable();
      collection.string('grantId', { length: 64 }).nullable();
      collection.string('action', { length: 64 }).notNull();
      collection.string('decision', { length: 32 }).notNull();
      collection.string('reason', { length: 128 }).nullable();
      collection.json('details').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_agent_audit_events' });
      collection.index('createdAt', { name: 'idx_agent_audit_events_time' });
      collection.index(['clientId', 'action'], {
        name: 'idx_agent_audit_events_client_action',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('agentAuditEvents');
    await builder.dropCollection('agentTokens');
    await builder.dropCollection('agentAuthCodes');
    await builder.dropCollection('agentGrants');
    await builder.dropCollection('agentClients');
  },
});

export default migration;
