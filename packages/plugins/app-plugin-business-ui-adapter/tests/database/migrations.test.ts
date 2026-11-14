import { fileURLToPath } from 'node:url';

import { validateMigrations } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../../database/migrations', import.meta.url),
);
const migrations = [
  {
    packageName: '@nocobase/app-plugin-business-ui-adapter',
    directory: migrationsDirectory,
  },
];

describe('@nocobase/app-plugin-business-ui-adapter', () => {
  it('loads its migrations', async () => {
    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toBeInstanceOf(Array);
  });
});

describeMigration('business_ui_adapter_202611130001_create_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    for (const name of [
      'businessUiConnections',
      'businessUiForms',
      'businessUiOAuthCodes',
      'businessUiTickets',
      'businessUiEmbedContexts',
      'businessUiInteractions',
      'businessUiOperations',
      'businessUiReceipts',
      'integrationTestDocuments',
    ]) {
      await expectCollection(name).toExist();
    }
    await expectCollection('businessUiTickets').toHaveField('ticketDigest', {
      type: 'string',
      nullable: false,
      length: 128,
    });
    await expectCollection('businessUiOperations').toHaveField(
      'idempotencyKey',
      { type: 'string', nullable: false, length: 255 },
    );
    await expectCollection('integrationTestDocuments').toHaveField(
      'formalRecordId',
      { type: 'string', nullable: true, length: 128 },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('businessUiConnections').not.toExist();
    await expectCollection('integrationTestDocuments').not.toExist();
  },
});

describeMigration(
  'business_ui_adapter_202611140001_ticket_nonce_and_submit_slot',
  {
    sources: migrations,
    up: async ({ expectCollection }) => {
      await expectCollection('businessUiTickets').toHaveField('nonce', {
        type: 'string',
        nullable: true,
        length: 255,
      });
      await expectCollection('businessUiTickets').toHaveField('action', {
        type: 'string',
        nullable: true,
        length: 64,
      });
      await expectCollection('businessUiTickets').toHaveField(
        'bindingRevision',
        {
          type: 'string',
          nullable: true,
          length: 64,
        },
      );
      await expectCollection('businessUiInteractions').toHaveField(
        'submitSlotOperationId',
        {
          type: 'string',
          nullable: true,
          length: 128,
        },
      );
      await expectCollection('businessUiOperations').toHaveField(
        'attemptCount',
        {
          type: 'integer',
          nullable: false,
        },
      );
      await expectCollection('businessUiOperations').toHaveField(
        'sideEffectConfirmed',
        {
          type: 'boolean',
          nullable: true,
        },
      );
      await expectCollection('businessUiEmbedContexts').toHaveField('mode', {
        type: 'string',
        nullable: true,
        length: 32,
      });
      await expectCollection('businessUiEmbedContexts').toHaveField('nonce', {
        type: 'string',
        nullable: true,
        length: 255,
      });
    },
    down: async ({ expectCollection }) => {
      await expectCollection('businessUiTickets').not.toHaveField('nonce');
      await expectCollection('businessUiInteractions').not.toHaveField(
        'submitSlotOperationId',
      );
      await expectCollection('businessUiOperations').not.toHaveField(
        'attemptCount',
      );
      await expectCollection('businessUiEmbedContexts').not.toHaveField('mode');
    },
  },
);

describeMigration(
  'business_ui_adapter_202611140002_binding_revision_and_stale_invalidation',
  {
    sources: migrations,
    up: async ({ expectCollection }) => {
      await expectCollection('businessUiEmbedContexts').toHaveField(
        'bindingRevision',
        { type: 'string', nullable: true, length: 64 },
      );
      await expectCollection('businessUiEmbedContexts').toHaveField(
        'formConfigVersion',
        { type: 'string', nullable: true, length: 128 },
      );
      await expectCollection('businessUiEmbedContexts').toHaveField(
        'subjectBindingId',
        { type: 'string', nullable: true, length: 64 },
      );
    },
    down: async ({ expectCollection }) => {
      await expectCollection('businessUiEmbedContexts').not.toHaveField(
        'bindingRevision',
      );
      await expectCollection('businessUiEmbedContexts').not.toHaveField(
        'formConfigVersion',
      );
      await expectCollection('businessUiEmbedContexts').not.toHaveField(
        'subjectBindingId',
      );
    },
  },
);

describeMigration('business_ui_adapter_202611150001_grant_columns', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    await expectCollection('businessUiConnections').toHaveField('clientId', {
      type: 'string',
      nullable: true,
      length: 255,
    });
    for (const name of [
      'businessUiTickets',
      'businessUiEmbedContexts',
      'businessUiInteractions',
    ]) {
      await expectCollection(name).toHaveField('grantId', {
        type: 'string',
        nullable: true,
        length: 64,
      });
      await expectCollection(name).toHaveField('grantRevision', {
        type: 'integer',
        nullable: true,
      });
      await expectCollection(name).toHaveField('clientId', {
        type: 'string',
        nullable: true,
        length: 255,
      });
    }
    await expectCollection('businessUiTickets').toHaveField(
      'subjectBindingId',
      { type: 'string', nullable: true, length: 64 },
    );
    await expectCollection('businessUiInteractions').toHaveField(
      'subjectBindingId',
      { type: 'string', nullable: true, length: 64 },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('businessUiConnections').not.toHaveField('clientId');
    await expectCollection('businessUiTickets').not.toHaveField('grantId');
    await expectCollection('businessUiEmbedContexts').not.toHaveField(
      'grantId',
    );
    await expectCollection('businessUiInteractions').not.toHaveField('grantId');
    await expectCollection('businessUiTickets').toHaveField(
      'subjectBindingId',
      { type: 'string', nullable: false, length: 64 },
    );
  },
});
