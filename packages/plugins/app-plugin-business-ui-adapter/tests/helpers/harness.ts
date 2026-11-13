import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Auth,
  createUserAdministrationService,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { createMigrator, type DatabaseManager } from '@nocobase/db';

import type { BusinessUiAdapterConfig } from '../../server/config.js';
import {
  createProtocolServices,
  type ProtocolServices,
} from '../../server/services/protocol.js';
import { randomId } from '../../server/crypto.js';

const require = createRequire(import.meta.url);
export const ISSUER = 'https://octop.test.local';
const BASE_URL = 'http://localhost/api/auth';
export const PASSWORD = 'password-at-least-8';
export const CONNECTION_ID = 'site-a';
export const SERVICE_SECRET = 'connection-service-secret';

function packageMigrations(packageName: string): string {
  return path.join(
    path.dirname(require.resolve(`${packageName}/package.json`)),
    'database/migrations',
  );
}

export interface AdapterHarness {
  readonly testDatabase: TestDatabase;
  readonly database: DatabaseManager;
  readonly auth: Auth;
  readonly users: UserAdministrationService;
  readonly services: ProtocolServices;
  readonly config: { current: BusinessUiAdapterConfig };
  readonly createLocalUser: (email: string, name?: string) => Promise<string>;
  readonly bindSubject: (subject: string, userId: string) => Promise<string>;
  readonly seedDefaults: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function createAdapterHarness(
  initialConfig: BusinessUiAdapterConfig = {},
): Promise<AdapterHarness> {
  const testDatabase = await createTestDatabase();
  const database = testDatabase.database;
  for (const [packageName, directory] of [
    [
      '@nocobase/app-plugin-authentication',
      packageMigrations('@nocobase/app-plugin-authentication'),
    ],
    [
      '@nocobase/app-plugin-authorization',
      packageMigrations('@nocobase/app-plugin-authorization'),
    ],
    [
      '@nocobase/app-plugin-casdoor-identity',
      packageMigrations('@nocobase/app-plugin-casdoor-identity'),
    ],
    [
      '@nocobase/app-plugin-business-ui-adapter',
      fileURLToPath(new URL('../../database/migrations', import.meta.url)),
    ],
  ] as const) {
    await createMigrator({ database, packageName, directory }).latest();
  }

  const auth = new Auth({
    connection: database.connection(),
    baseURL: BASE_URL,
    secret: 'development-secret-at-least-32-characters',
    appName: 'NocoBase3',
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { storeSessionInDatabase: true },
  });
  const users = createUserAdministrationService({
    connection: database.connection(),
    auth,
  });
  const config = { current: initialConfig };
  const services = createProtocolServices({
    database: () => database,
    auth: () => auth,
    config: () => config.current,
  });

  return {
    testDatabase,
    database,
    auth,
    users,
    services,
    config,
    createLocalUser: async (email, name = email) =>
      (await users.create({ name, email, password: PASSWORD })).id,
    bindSubject: async (subject, userId) => {
      const id = randomId('binding');
      const now = new Date();
      const externalId = randomId('ext');
      await database
        .connection()
        .query.insertInto('externalIdentities')
        .values({
          id: externalId,
          providerIssuer: ISSUER,
          providerSubject: subject,
          localUserId: userId,
          lastSyncedAt: now,
          lastSeenEnabled: true,
          disabledBySyncAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await database
        .connection()
        .query.insertInto('businessUiSubjectBindings')
        .values({
          id,
          connectionId: CONNECTION_ID,
          octopSubject: subject,
          localUserId: userId,
          externalIdentityId: externalId,
          status: 'active',
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return id;
    },
    seedDefaults: async () => {
      await services.upsertConnection({
        connectionId: CONNECTION_ID,
        octopIssuer: ISSUER,
        allowedOrigins: ['https://octop.test.local'],
        serviceSecret: SERVICE_SECRET,
        enabled: true,
      });
      await services.upsertForm({
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        mode: 'edit',
        handlerKey: 'generic-request',
      });
      await services.upsertForm({
        formRef: 'generic.request.detail',
        schemaVersion: '1',
        mode: 'detail',
        handlerKey: 'generic-request',
      });
    },
    close: async () => {
      await auth.close();
      await testDatabase.destroy();
    },
  };
}
