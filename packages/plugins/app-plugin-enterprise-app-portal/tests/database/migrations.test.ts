import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

const source = (packageName: string, directory: string) => ({
  packageName,
  directory: fileURLToPath(new URL(directory, import.meta.url)),
});

describeMigration('enterprise_app_portal_202611212000_add_agent_grants', {
  sources: [
    source(
      '@superice/app-plugin-enterprise-app-portal',
      '../../database/migrations',
    ),
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('enterprisePortalApplications').toHaveField(
      'agentGrantsEnabled',
      { type: 'boolean', nullable: false },
    );
    await expectCollection('enterprisePortalApplications').toHaveField(
      'apiBaseUrl',
      { type: 'string', nullable: true, length: 512 },
    );
    await expectCollection('enterprisePortalApplications').toHaveField(
      'apiAuthMode',
      { type: 'string', nullable: true, length: 32 },
    );
    await expectCollection('enterprisePortalApplications').toHaveField(
      'apiTokenEnv',
      { type: 'string', nullable: true, length: 128 },
    );
    await expectCollection('enterprisePortalApplications').toHaveField(
      'apiUsernameEnv',
      { type: 'string', nullable: true, length: 128 },
    );
    await expectCollection('enterprisePortalApplications').toHaveField(
      'apiPasswordEnv',
      { type: 'string', nullable: true, length: 128 },
    );
    await expectCollection('enterprisePortalAgentGrantOperations').toHaveField(
      'lockKey',
      { type: 'string', nullable: true, length: 256 },
    );
    await expectCollection('enterprisePortalAgentGrantOperations').toHaveField(
      'createOptionsSnapshot',
      { type: 'text', nullable: false },
    );
    await expectCollection('enterprisePortalAgentGrantOperations').toHaveIndex(
      ['lockKey'],
      { unique: true },
    );
    await expectCollection('enterprisePortalAgentGrantOperations').toHaveIndex([
      'appCode',
      'casdoorUserId',
    ]);
    await expectCollection('enterprisePortalAgentGrantOperations').toHaveIndex([
      'status',
    ]);
  },
  down: async ({ expectCollection }) => {
    await expectCollection(
      'enterprisePortalAgentGrantOperations',
    ).not.toExist();
    await expectCollection('enterprisePortalApplications').not.toHaveField(
      'agentGrantsEnabled',
    );
    await expectCollection('enterprisePortalApplications').not.toHaveField(
      'apiBaseUrl',
    );
    await expectCollection('enterprisePortalApplications').not.toHaveField(
      'apiPasswordEnv',
    );
  },
});

describeMigration('enterprise_app_portal_202611200001_create_collections', {
  sources: [
    source(
      '@superice/app-plugin-enterprise-app-portal',
      '../../database/migrations',
    ),
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('enterprisePortalApplications').toHaveField(
      'appCode',
      { type: 'string', nullable: false, length: 64 },
    );
    await expectCollection('enterprisePortalUserPreferences').toHaveField(
      'userId',
      { type: 'string', nullable: false, length: 64 },
    );
    await expectCollection('enterprisePortalAuditEvents').toHaveField(
      'createdAt',
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('enterprisePortalApplications').not.toExist();
    await expectCollection('enterprisePortalUserPreferences').not.toExist();
    await expectCollection('enterprisePortalAuditEvents').not.toExist();
  },
});
