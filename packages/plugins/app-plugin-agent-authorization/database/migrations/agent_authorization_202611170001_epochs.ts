import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Client and credential epochs. Disabling a client or a user bumps the epoch
 * and refuses credentials issued at the previous value, including after re-enable.
 * Existing rows start at 1 so credentials that were never disabled stay usable.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'agent_authorization_202611170001_epochs',

  async up({ builder }) {
    await builder.alterCollection('agentClients', (collection) => {
      collection.integer('epoch', { nullable: false, defaultValue: 1 });
    });
    await builder.alterCollection('agentGrants', (collection) => {
      collection.integer('credentialEpoch', {
        nullable: false,
        defaultValue: 1,
      });
    });
    await builder.alterCollection('agentTokens', (collection) => {
      collection.integer('clientEpoch', { nullable: false, defaultValue: 1 });
      collection.integer('credentialEpoch', {
        nullable: false,
        defaultValue: 1,
      });
    });
    await builder.alterCollection('agentAuthCodes', (collection) => {
      collection.integer('clientEpoch', { nullable: false, defaultValue: 1 });
      collection.integer('credentialEpoch', {
        nullable: false,
        defaultValue: 1,
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('agentAuthCodes', (collection) => {
      collection.dropField('credentialEpoch');
      collection.dropField('clientEpoch');
    });
    await builder.alterCollection('agentTokens', (collection) => {
      collection.dropField('credentialEpoch');
      collection.dropField('clientEpoch');
    });
    await builder.alterCollection('agentGrants', (collection) => {
      collection.dropField('credentialEpoch');
    });
    await builder.alterCollection('agentClients', (collection) => {
      collection.dropField('epoch');
    });
  },
});

export default migration;
