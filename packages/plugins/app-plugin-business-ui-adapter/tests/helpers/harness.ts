import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAgentAuthorizationServices } from '@nocobase/app-plugin-agent-authorization/server';
import {
  Auth,
  createUserAdministrationService,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { createSecretsService } from '@nocobase/app-server/secrets';
import { createMigrator, type DatabaseManager } from '@nocobase/db';

import type { BusinessUiAdapterConfig } from '../../server/config.js';
import { createAllowlistAccessChecker } from '../../server/business-access.js';
import { ProtocolError } from '../../server/errors.js';
import {
  grantContextFromCredentialData,
  type GrantContext,
} from '../../server/grants.js';
import {
  createProtocolServices,
  type ProtocolServices,
} from '../../server/services/protocol.js';

const require = createRequire(import.meta.url);
export const ISSUER = 'https://octop.test.local';
const BASE_URL = 'http://localhost/api/auth';
const AUDIENCE = 'http://localhost';
const REDIRECT_URI = 'https://octop.test.local/oauth/callback';
const AGENT_SCOPES = ['business-ui:view', 'business-ui:edit'] as const;
export const PASSWORD = 'password-at-least-8';
export const CONNECTION_ID = 'site-a';
export const SERVICE_SECRET = 'connection-service-secret';
export const PERMISSION_EDIT = 'generic.request:edit';
export const PERMISSION_VIEW = 'generic.request:view';

function packageMigrations(packageName: string): string {
  return path.join(
    path.dirname(require.resolve(`${packageName}/package.json`)),
    'database/migrations',
  );
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
  return { verifier, challenge };
}

export interface AdapterHarness {
  readonly testDatabase: TestDatabase;
  readonly database: DatabaseManager;
  readonly auth: Auth;
  readonly users: UserAdministrationService;
  readonly services: ProtocolServices;
  readonly config: { current: BusinessUiAdapterConfig };
  readonly grants: Map<string, Set<string>>;
  readonly createLocalUser: (
    email: string,
    name?: string,
    options?: { grantDefaults?: boolean },
  ) => Promise<string>;
  readonly grantAccess: (
    userId: string,
    permissionRefs: readonly string[],
  ) => void;
  readonly revokeAccess: (
    userId: string,
    permissionRefs: readonly string[],
  ) => void;
  /** Creates an agent client grant and returns the opaque access token plus grant. */
  readonly authorizeAgent: (
    userId: string,
  ) => Promise<{ accessToken: string; grant: GrantContext }>;
  readonly grantFor: (userId: string) => GrantContext;
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
      '@nocobase/app-plugin-agent-authorization',
      packageMigrations('@nocobase/app-plugin-agent-authorization'),
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
  const secrets = createSecretsService({
    keys: [
      {
        version: 1,
        key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
    ],
  });
  const grants = new Map<string, Set<string>>();
  const agent = createAgentAuthorizationServices({
    database: () => database,
    config: () => ({ audience: AUDIENCE }),
    defaultAudience: () => AUDIENCE,
  });
  const grantsByUser = new Map<string, GrantContext>();
  let clientReady: Promise<string> | undefined;
  const ensureClient = (): Promise<string> => {
    clientReady ??= agent.clients
      .create({
        name: 'Octop test agent',
        redirectUris: [REDIRECT_URI],
        allowedScopes: [...AGENT_SCOPES],
        allowedOrigins: ['https://octop.test.local'],
      })
      .then((created) => created.clientId);
    return clientReady;
  };

  const services = createProtocolServices({
    database: () => database,
    auth: () => auth,
    config: () => config.current,
    secrets: () => secrets,
    authorizeBusiness: createAllowlistAccessChecker(grants),
    audience: () => AUDIENCE,
    getAgentCredential: (userId, credentialData) =>
      grantContextFromCredentialData(userId, credentialData),
    requireGrant: async (grantId) => {
      try {
        const row = await agent.grants.requireActive(grantId);
        return {
          grantId: row.id,
          clientId: row.clientId,
          localUserId: row.localUserId,
          audience: row.audience,
          scopes: row.scopes,
          revision: row.revision,
        };
      } catch (error) {
        if (error instanceof ProtocolError) throw error;
        throw new ProtocolError(
          'GRANT_REQUIRED',
          403,
          'Agent grant is not active',
        );
      }
    },
  });

  const grantAccess = (userId: string, permissionRefs: readonly string[]) => {
    for (const ref of permissionRefs) {
      const set = grants.get(ref) ?? new Set<string>();
      set.add(userId);
      grants.set(ref, set);
    }
  };
  const revokeAccess = (userId: string, permissionRefs: readonly string[]) => {
    for (const ref of permissionRefs) {
      grants.get(ref)?.delete(userId);
    }
  };

  return {
    testDatabase,
    database,
    auth,
    users,
    services,
    config,
    grants,
    createLocalUser: async (email, name = email, options) => {
      const id = (await users.create({ name, email, password: PASSWORD })).id;
      if (options?.grantDefaults !== false) {
        grantAccess(id, [PERMISSION_EDIT, PERMISSION_VIEW]);
      }
      return id;
    },
    grantAccess,
    revokeAccess,
    authorizeAgent: async (userId) => {
      const clientId = await ensureClient();
      const row = await agent.grants.createOrReuse({
        clientId,
        localUserId: userId,
        audience: AUDIENCE,
        scopes: [...AGENT_SCOPES],
      });
      const { verifier, challenge } = pkcePair();
      const code = await agent.oauth.createAuthorizationCode({
        clientId,
        localUserId: userId,
        grantId: row.id,
        redirectUri: REDIRECT_URI,
        codeChallenge: challenge,
        scope: AGENT_SCOPES.join(' '),
      });
      const tokens = await agent.oauth.exchangeAuthorizationCode({
        clientId,
        code,
        redirectUri: REDIRECT_URI,
        codeVerifier: verifier,
      });
      const grant: GrantContext = {
        grantId: row.id,
        clientId: row.clientId,
        localUserId: row.localUserId,
        audience: row.audience,
        scopes: row.scopes,
        revision: row.revision,
      };
      grantsByUser.set(userId, grant);
      return { accessToken: tokens.access_token, grant };
    },
    grantFor: (userId) => {
      const grant = grantsByUser.get(userId);
      if (!grant) {
        throw new Error(
          `No agent grant for ${userId}; call authorizeAgent first`,
        );
      }
      return grant;
    },
    seedDefaults: async () => {
      const clientId = await ensureClient();
      await services.upsertConnection({
        connectionId: CONNECTION_ID,
        octopIssuer: ISSUER,
        allowedOrigins: ['https://octop.test.local'],
        serviceSecret: SERVICE_SECRET,
        clientId,
        enabled: true,
      });
      await services.upsertForm({
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        mode: 'edit',
        handlerKey: 'generic-request',
        permissionRef: PERMISSION_EDIT,
      });
      await services.upsertForm({
        formRef: 'generic.request.detail',
        schemaVersion: '1',
        mode: 'detail',
        handlerKey: 'generic-request',
        permissionRef: PERMISSION_VIEW,
      });
    },
    close: async () => {
      await auth.close();
      await testDatabase.destroy();
    },
  };
}
