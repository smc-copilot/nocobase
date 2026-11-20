import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

const source = (packageName: string, directory: string) => ({
  packageName,
  directory: fileURLToPath(new URL(directory, import.meta.url)),
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
