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

import {
  createAgentAuthorizationServices,
  type AgentAuthorizationServices,
} from '../../server/services/index.js';

const require = createRequire(import.meta.url);

function packageMigrations(packageName: string): string {
  return path.join(
    path.dirname(require.resolve(`${packageName}/package.json`)),
    'database/migrations',
  );
}

export const PASSWORD = 'password-at-least-8';
const BASE_URL = 'http://localhost/api/auth';
export const AUDIENCE = 'http://localhost:13000';

export interface AgentAuthHarness {
  readonly testDatabase: TestDatabase;
  readonly database: DatabaseManager;
  readonly auth: Auth;
  readonly users: UserAdministrationService;
  readonly services: AgentAuthorizationServices;
  readonly createLocalUser: (email: string, name?: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

export async function createAgentAuthHarness(): Promise<AgentAuthHarness> {
  const testDatabase = await createTestDatabase();
  const database = testDatabase.database;
  for (const [packageName, directory] of [
    [
      '@nocobase/app-plugin-authentication',
      packageMigrations('@nocobase/app-plugin-authentication'),
    ],
    [
      '@nocobase/app-plugin-agent-authorization',
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
  const services = createAgentAuthorizationServices({
    database: () => database,
    config: () => ({ audience: AUDIENCE }),
    defaultAudience: () => AUDIENCE,
  });

  return {
    testDatabase,
    database,
    auth,
    users,
    services,
    createLocalUser: async (email, name = 'Agent User') => {
      const user = await users.create({
        email,
        name,
        password: PASSWORD,
      });
      return user.id;
    },
    close: async () => {
      await auth.close();
      await testDatabase.destroy();
    },
  };
}
