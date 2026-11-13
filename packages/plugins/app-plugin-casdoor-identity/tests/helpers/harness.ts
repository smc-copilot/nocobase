import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Auth,
  createUserAdministrationService,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { createMigrator, type DatabaseManager } from '@nocobase/db';

import type { CasdoorIdentityConfig } from '../../server/config.js';
import type { IdentityDirectory } from '../../server/directory.js';
import type { IdentityRuntime } from '../../server/identity/model.js';
import {
  createIdentityServices,
  type IdentityServices,
} from '../../server/identity/services.js';

const require = createRequire(import.meta.url);
export const ISSUER = 'https://casdoor.test.local';
const BASE_URL = 'http://localhost/api/auth';

function packageMigrations(packageName: string): string {
  return path.join(
    path.dirname(require.resolve(`${packageName}/package.json`)),
    'database/migrations',
  );
}

export interface IdentityHarness {
  readonly testDatabase: TestDatabase;
  readonly database: DatabaseManager;
  readonly auth: Auth;
  readonly users: UserAdministrationService;
  readonly authz: AppAuthorization;
  readonly runtime: IdentityRuntime;
  readonly services: IdentityServices;
  readonly config: { current: CasdoorIdentityConfig };
  readonly directory: { current: IdentityDirectory | undefined };
  /** A second, independent service graph over the same database (another "process"). */
  readonly spawnServices: () => IdentityServices;
  readonly createLocalUser: (email: string, name?: string) => Promise<string>;
  readonly signIn: (email: string) => Promise<void>;
  readonly sessionCount: (userId: string) => Promise<number>;
  readonly bind: (subject: string, userId: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

export const PASSWORD = 'password-at-least-8';

/** A real database with the authentication, authorization and identity migrations applied. */
export async function createIdentityHarness(
  initialConfig: CasdoorIdentityConfig = {},
): Promise<IdentityHarness> {
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
  const authz = createAppAuthorization({ connection: database.connection() });
  for (const key of ['content-editor', 'reports-viewer', 'finance']) {
    await authz.permissionSets.create({ key, title: key, grants: [] });
  }
  await authz.permissionSets.create({ key: 'root', title: 'root', grants: [] });

  const config = { current: initialConfig };
  const directory: { current: IdentityDirectory | undefined } = {
    current: undefined,
  };
  const runtime: IdentityRuntime = {
    database: () => database,
    auth: () => auth,
    users: () => users,
    permissionSets: () => authz.permissionSets,
    config: () => config.current,
  };
  const spawn = (): IdentityServices =>
    createIdentityServices(runtime, () => directory.current);

  return {
    testDatabase,
    database,
    auth,
    users,
    authz,
    runtime,
    services: spawn(),
    config,
    directory,
    spawnServices: spawn,
    createLocalUser: async (email, name = email) =>
      (await users.create({ name, email, password: PASSWORD })).id,
    signIn: async (email) => {
      const response = await auth.handler(
        new Request(`${BASE_URL}/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: PASSWORD }),
        }),
      );
      if (response.status !== 200) {
        throw new Error(`Sign-in failed: ${await response.text()}`);
      }
    },
    sessionCount: async (userId) =>
      (
        await database
          .connection()
          .query.selectFrom('session')
          .select('id')
          .where('userId', '=', userId)
          .execute()
      ).length,
    bind: async (subject, userId) => {
      const id = `bind-${subject}`;
      const now = new Date();
      await database
        .connection()
        .query.insertInto('externalIdentities')
        .values({
          id,
          providerIssuer: ISSUER,
          providerSubject: subject,
          localUserId: userId,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return id;
    },
    close: async () => {
      await auth.close();
      await testDatabase.destroy();
    },
  };
}

/** Registers the standard test provider: admits the `acme` organization. */
export async function registerProvider(
  harness: IdentityHarness,
  admissionPolicy: Record<string, unknown> = { allowOrganizations: ['acme'] },
): Promise<void> {
  await harness.services.providers.upsert(
    {
      providerId: 'casdoor',
      issuer: ISSUER,
      admissionPolicy,
      secretRef: 'env:CASDOOR_SECRET',
    },
    null,
  );
}
