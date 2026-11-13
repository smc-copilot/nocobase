import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates Business UI Adapter protocol collections.
 *
 * `businessUiSubjectBindings` lives in casdoor-identity and is not recreated here.
 * Shapes are spelled out rather than imported from live definitions so later schema
 * changes cannot alter what this migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611130001_create_collections',

  async up({ builder }) {
    await builder.createCollection('businessUiConnections', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('octopIssuer', { length: 512 }).notNull();
      collection.json('allowedOrigins').notNull();
      collection.string('serviceSecretHash', { length: 128 }).notNull();
      collection.boolean('enabled').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_connections' });
      collection.unique('connectionId', {
        name: 'uq_business_ui_connections_connection_id',
        mode: 'index',
      });
    });

    await builder.createCollection('businessUiForms', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('formRef', { length: 255 }).notNull();
      collection.string('schemaVersion', { length: 64 }).notNull();
      collection.string('mode', { length: 32 }).notNull();
      collection.string('handlerKey', { length: 128 }).notNull();
      collection.string('permissionRef', { length: 255 }).nullable();
      collection.string('documentType', { length: 128 }).notNull();
      collection.boolean('enabled').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_forms' });
      collection.unique(['formRef', 'schemaVersion'], {
        name: 'uq_business_ui_forms_ref_version',
        mode: 'index',
      });
    });

    await builder.createCollection('businessUiOAuthCodes', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('stateDigest', { length: 128 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('encryptedCode', { length: 1024 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('consumedAt').nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_oauth_codes' });
      collection.unique('stateDigest', {
        name: 'uq_business_ui_oauth_codes_state',
        mode: 'index',
      });
      collection.index('connectionId', {
        name: 'idx_business_ui_oauth_codes_connection',
      });
    });

    await builder.createCollection('businessUiTickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketDigest', { length: 128 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('subjectBindingId', { length: 64 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.string('formRef', { length: 255 }).notNull();
      collection.string('schemaVersion', { length: 64 }).notNull();
      collection.json('context').notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('consumedAt').nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_tickets' });
      collection.unique('ticketDigest', {
        name: 'uq_business_ui_tickets_digest',
        mode: 'index',
      });
      collection.index('interactionId', {
        name: 'idx_business_ui_tickets_interaction',
      });
    });

    await builder.createCollection('businessUiEmbedContexts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('authSessionRef', { length: 255 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('formRef', { length: 255 }).notNull();
      collection.string('schemaVersion', { length: 64 }).notNull();
      collection.json('actionBounds').notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_embed_contexts' });
      collection.unique('authSessionRef', {
        name: 'uq_business_ui_embed_contexts_session',
        mode: 'index',
      });
      collection.index('interactionId', {
        name: 'idx_business_ui_embed_contexts_interaction',
      });
    });

    await builder.createCollection('businessUiInteractions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('subjectBindingId', { length: 64 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('recordId', { length: 128 }).nullable();
      collection.string('latestReceiptId', { length: 64 }).nullable();
      collection.string('latestSubmitOperationId', { length: 128 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_interactions' });
      collection.unique('interactionId', {
        name: 'uq_business_ui_interactions_id',
        mode: 'index',
      });
    });

    await builder.createCollection('businessUiOperations', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('operationId', { length: 128 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('localUserId', { length: 64 }).notNull();
      collection.string('idempotencyKey', { length: 255 }).notNull();
      collection.string('requestDigest', { length: 128 }).notNull();
      collection.string('kind', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('resultType', { length: 64 }).nullable();
      collection.json('result').nullable();
      collection.boolean('safeRetry').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_operations' });
      collection.unique('operationId', {
        name: 'uq_business_ui_operations_id',
        mode: 'index',
      });
      collection.unique(['interactionId', 'idempotencyKey'], {
        name: 'uq_business_ui_operations_idempotency',
        mode: 'index',
      });
    });

    await builder.createCollection('businessUiReceipts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('operationId', { length: 128 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.integer('recordVersion').notNull();
      collection.integer('sequence').notNull();
      collection.json('payload').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_business_ui_receipts' });
      collection.unique(['interactionId', 'sequence'], {
        name: 'uq_business_ui_receipts_sequence',
        mode: 'index',
      });
      collection.index('operationId', {
        name: 'idx_business_ui_receipts_operation',
      });
    });

    await builder.createCollection('integrationTestDocuments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('draftId', { length: 128 }).notNull();
      collection.string('formalRecordId', { length: 128 }).nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('connectionId', { length: 128 }).notNull();
      collection.string('interactionId', { length: 128 }).notNull();
      collection.string('title', { length: 512 }).notNull();
      collection.text('description').nullable();
      collection.integer('quantity').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('version').notNull();
      collection.string('batchId', { length: 128 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_integration_test_documents' });
      collection.unique('draftId', {
        name: 'uq_integration_test_documents_draft',
        mode: 'index',
      });
      collection.unique('formalRecordId', {
        name: 'uq_integration_test_documents_formal',
        mode: 'index',
      });
      collection.index('interactionId', {
        name: 'idx_integration_test_documents_interaction',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('integrationTestDocuments');
    await builder.dropCollection('businessUiReceipts');
    await builder.dropCollection('businessUiOperations');
    await builder.dropCollection('businessUiInteractions');
    await builder.dropCollection('businessUiEmbedContexts');
    await builder.dropCollection('businessUiTickets');
    await builder.dropCollection('businessUiOAuthCodes');
    await builder.dropCollection('businessUiForms');
    await builder.dropCollection('businessUiConnections');
  },
});

export default migration;
