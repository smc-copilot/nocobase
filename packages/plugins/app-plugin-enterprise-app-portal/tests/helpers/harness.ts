import { fileURLToPath } from 'node:url';

import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { createMigrator, type DatabaseManager } from '@nocobase/db';

import type { EnterpriseAppPortalConfig } from '../../server/config.js';
import {
  createEnterprisePortalServices,
  type EnterprisePortalServices,
} from '../../server/services/composition.js';
import type { DnsLookup } from '../../server/services/url-guard.js';

export const PUBLIC_LOOKUP: DnsLookup = async () => [
  { address: '93.184.216.34', family: 4 },
];

export const PRIVATE_LOOKUP: DnsLookup = async () => [
  { address: '127.0.0.1', family: 4 },
];

export interface PortalHarness {
  readonly testDatabase: TestDatabase;
  readonly database: DatabaseManager;
  readonly config: { current: EnterpriseAppPortalConfig };
  readonly services: EnterprisePortalServices;
  readonly close: () => Promise<void>;
}

export async function createPortalHarness(
  initial: EnterpriseAppPortalConfig = {
    launchHostAllowlist: ['example.com'],
    access: {
      source: 'contractFixture',
      fixtureGrants: [{ userId: 'user-1', appCodes: ['octop', 'weknora'] }],
    },
  },
  options: {
    readonly lookup?: DnsLookup;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<PortalHarness> {
  const testDatabase = await createTestDatabase();
  const database = testDatabase.database;
  await createMigrator({
    database,
    packageName: '@superice/app-plugin-enterprise-app-portal',
    directory: fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    ),
  }).latest();
  const config = { current: initial };
  const services = createEnterprisePortalServices(
    () => database,
    () => config.current,
    {
      lookup: options.lookup ?? PUBLIC_LOOKUP,
      fetchImpl:
        options.fetchImpl ?? (async () => new Response('ok', { status: 200 })),
    },
  );
  return {
    testDatabase,
    database,
    config,
    services,
    close: async () => {
      await testDatabase.destroy();
    },
  };
}
