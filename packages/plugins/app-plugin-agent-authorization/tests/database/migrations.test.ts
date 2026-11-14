import { fileURLToPath } from 'node:url';

import { validateMigrations } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../../database/migrations', import.meta.url),
);
const migrations = [
  {
    packageName: '@nocobase/app-plugin-agent-authorization',
    directory: migrationsDirectory,
  },
];

describe('@nocobase/app-plugin-agent-authorization', () => {
  it('loads its migrations', async () => {
    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toBeInstanceOf(Array);
  });
});

describeMigration('agent_authorization_202611150001_create_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    for (const name of [
      'agentClients',
      'agentGrants',
      'agentAuthCodes',
      'agentTokens',
      'agentAuditEvents',
    ]) {
      await expectCollection(name).toExist();
    }
    await expectCollection('agentClients').toHaveField('clientId', {
      type: 'string',
      nullable: false,
      length: 128,
    });
    await expectCollection('agentTokens').toHaveField('grantRevision', {
      type: 'integer',
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('agentClients').not.toExist();
    await expectCollection('agentTokens').not.toExist();
  },
});
