import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

import { clearDatabaseEnv } from '../helpers/clear-db-env.js';

clearDatabaseEnv();

const migrations = [
  {
    packageName: '@nocobase/app-plugin-identity-hub',
    directory: fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    ),
  },
];

const collections = [
  'identityHubPersons',
  'identityHubPersonIdentities',
  'identityHubProviders',
  'identityHubOrganizations',
  'identityHubDepartments',
  'identityHubApps',
  'identityHubAppMemberships',
  'identityHubAuditEvents',
  'identityHubSyncRuns',
  'identityHubConflicts',
];

describeMigration('identity_hub_202611280001_create_core', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    await expectCollection('identityHubPersons').toHaveField('employeeNo', {
      type: 'string',
      nullable: true,
      length: 64,
    });
    await expectCollection('identityHubPersons').toHaveField('version', {
      type: 'integer',
      nullable: false,
    });
    await expectCollection('identityHubPersonIdentities').toHaveField(
      'identityKey',
      { type: 'string', nullable: false, length: 255 },
    );
    await expectCollection('identityHubProviders').toHaveField('secretRef', {
      type: 'string',
      nullable: true,
      length: 255,
    });
    await expectCollection('identityHubProviders').toHaveField('enabled', {
      type: 'boolean',
      nullable: false,
    });
    await expectCollection('identityHubAuditEvents').toHaveField('details', {
      type: 'json',
      nullable: false,
    });
    await expectCollection('identityHubSyncRuns').toHaveField('stats', {
      type: 'json',
      nullable: true,
    });
    await expectCollection('identityHubConflicts').toHaveField('payload', {
      type: 'json',
      nullable: false,
    });
    await expectCollection('identityHubAppMemberships').toHaveField(
      'revision',
      { type: 'integer', nullable: false },
    );
    for (const name of collections) {
      await expectCollection(name).toExist();
    }
  },
  down: async ({ expectCollection }) => {
    for (const name of collections) {
      await expectCollection(name).not.toExist();
    }
  },
});
