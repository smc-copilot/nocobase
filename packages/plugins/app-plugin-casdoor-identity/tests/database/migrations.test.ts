import { fileURLToPath } from 'node:url';

import { validateMigrations } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../../database/migrations', import.meta.url),
);
const migrations = [
  {
    packageName: '@nocobase/app-plugin-casdoor-identity',
    directory: migrationsDirectory,
  },
];

describe('@nocobase/app-plugin-casdoor-identity', () => {
  it('loads its migrations', async () => {
    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toBeInstanceOf(Array);
  });
});

describeMigration('casdoor_identity_202611140001_create_iam_sync_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    for (const name of [
      'identityProviders',
      'identityMappingRules',
      'managedPermissionAssignments',
      'identitySyncRuns',
      'businessUiSubjectBindings',
      'identityAuditEvents',
    ]) {
      await expectCollection(name).toExist();
    }
    await expectCollection('managedPermissionAssignments').toHaveField(
      'sourceRevision',
      { type: 'string', nullable: false, length: 128 },
    );
    await expectCollection('identitySyncRuns').toHaveField('batchId', {
      type: 'string',
      nullable: false,
      length: 128,
    });
    await expectCollection('businessUiSubjectBindings').toHaveField(
      'octopSubject',
      { type: 'string', nullable: false, length: 255 },
    );
    await expectCollection('externalIdentities').toHaveField(
      'disabledBySyncAt',
      { nullable: true },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('identityProviders').not.toExist();
    await expectCollection('businessUiSubjectBindings').not.toExist();
    await expectCollection('externalIdentities').not.toHaveField(
      'disabledBySyncAt',
    );
  },
});

describeMigration('casdoor_identity_202611130001_create_external_identities', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    await expectCollection('externalIdentities').toHaveField('providerIssuer', {
      type: 'string',
      nullable: false,
      length: 512,
    });
    await expectCollection('externalIdentities').toHaveField(
      'providerSubject',
      {
        type: 'string',
        nullable: false,
        length: 255,
      },
    );
    await expectCollection('externalIdentities').toHaveField('localUserId', {
      type: 'string',
      nullable: false,
      length: 64,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('externalIdentities').not.toExist();
  },
});
