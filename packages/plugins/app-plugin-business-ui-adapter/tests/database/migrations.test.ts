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
