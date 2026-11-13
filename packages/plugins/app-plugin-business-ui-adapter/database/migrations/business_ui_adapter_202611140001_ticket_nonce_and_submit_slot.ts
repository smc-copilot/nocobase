import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds ticket nonce / action / binding revision columns and an explicit submit-slot
 * column on interactions (FIX-07 / FIX-10). Prior migration is left untouched.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611140001_ticket_nonce_and_submit_slot',

  async up({ builder }) {
    await builder.alterCollection('businessUiTickets', (collection) => {
      collection.string('nonce', { length: 255 }).nullable();
      collection.string('action', { length: 64 }).nullable();
      collection.string('bindingRevision', { length: 64 }).nullable();
    });
    await builder.alterCollection('businessUiInteractions', (collection) => {
      // Stable submit operation id reserved before the first side effect.
      collection.string('submitSlotOperationId', { length: 128 }).nullable();
    });
    await builder.alterCollection('businessUiOperations', (collection) => {
      collection.integer('attemptCount', { nullable: false, defaultValue: 0 });
      collection.boolean('sideEffectConfirmed').nullable();
    });
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.string('mode', { length: 32 }).nullable();
      collection.string('nonce', { length: 255 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.dropField('nonce');
      collection.dropField('mode');
    });
    await builder.alterCollection('businessUiOperations', (collection) => {
      collection.dropField('sideEffectConfirmed');
      collection.dropField('attemptCount');
    });
    await builder.alterCollection('businessUiInteractions', (collection) => {
      collection.dropField('submitSlotOperationId');
    });
    await builder.alterCollection('businessUiTickets', (collection) => {
      collection.dropField('bindingRevision');
      collection.dropField('action');
      collection.dropField('nonce');
    });
  },
});

export default migration;
