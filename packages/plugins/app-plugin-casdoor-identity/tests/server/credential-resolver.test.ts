// @vitest-environment node

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Auth,
  createUserAdministrationService,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { createMigrator, type DatabaseManager } from '@nocobase/db';
import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { apiErrorHandler, describeRoute } from '@nocobase/app-server/router';
import { Hono } from 'hono';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CASDOOR_ACCESS_TOKEN_HEADER,
  CASDOOR_ACCESS_TOKEN_SCHEME,
} from '../../server/config.js';
import { createCasdoorCredentialResolver } from '../../server/credential-resolver.js';

const require = createRequire(import.meta.url);
const BASE_URL = 'http://localhost/api/auth';
const ISSUER = 'https://casdoor.test.local';
const AUDIENCE = 'nocobase-casdoor-spike';
const SUBJECT = 'casdoor-user-1';
const OWNER = {
  name: 'Ada',
  email: 'ada@example.com',
  password: 'password-at-least-8',
};

function authenticationMigrations(): string {
  return path.join(
    path.dirname(
      require.resolve('@nocobase/app-plugin-authentication/package.json'),
    ),
    'database/migrations',
  );
}

/**
 * Ephemeral RSA keypair + JWKS for CI. Live Casdoor verification is a separate evidence step
 * documented under prd/acceptance/p0/.
 */
async function createEphemeralJwtIssuer(): Promise<{
  readonly privateKey: KeyLike;
  readonly jwk: JWK;
  readonly sign: (subject?: string) => Promise<string>;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-casdoor';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return {
    privateKey,
    jwk,
    sign: async (subject = SUBJECT) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-casdoor' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
  };
}

describe('Casdoor credential resolver', () => {
  let testDatabase: TestDatabase;
  let database: DatabaseManager;
  let auth: Auth;
  let userId: string;
  let signToken: (subject?: string) => Promise<string>;
  let jwk: JWK;
  let router: Hono<AuthEnv>;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    for (const [packageName, directory] of [
      ['@nocobase/app-plugin-authentication', authenticationMigrations()],
      [
        '@nocobase/app-plugin-casdoor-identity',
        fileURLToPath(new URL('../../database/migrations', import.meta.url)),
      ],
    ] as const) {
      await createMigrator({ database, packageName, directory }).latest();
    }

    const issuer = await createEphemeralJwtIssuer();
    signToken = issuer.sign;
    jwk = issuer.jwk;

    auth = new Auth({
      connection: database.connection(),
      baseURL: BASE_URL,
      secret: 'development-secret-at-least-32-characters',
      appName: 'NocoBase3',
      emailAndPassword: { enabled: true, autoSignIn: true },
      session: { storeSessionInDatabase: true },
    });

    auth.addCredentialResolver(
      createCasdoorCredentialResolver({
        connection: () => database.connection(),
        config: () => ({
          issuer: ISSUER,
          audience: AUDIENCE,
          jwks: { keys: [jwk as Record<string, unknown>] },
        }),
      }),
    );
    auth.addCredentialRoutePolicy((context, credential) =>
      credential.scheme === CASDOOR_ACCESS_TOKEN_SCHEME &&
      context.req.path === '/casdoorIdentity/me'
        ? true
        : undefined,
    );

    router = new Hono<AuthEnv>();
    router.onError((error, context) => apiErrorHandler(error, context));
    router.get(
      '/casdoorIdentity/me',
      describeRoute({
        security: [{ cookieAuth: [] }, { [CASDOOR_ACCESS_TOKEN_SCHEME]: [] }],
      }),
      auth.required({ scopedKeys: true }),
      (context) => {
        const session = context.get('auth');
        return context.json({
          data: {
            userId: session!.user.id,
            credentialType: session?.credential?.type,
            credentialScheme: session?.credential?.scheme,
          },
        });
      },
    );

    const signUp = await auth.handler(
      new Request(`${BASE_URL}/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(OWNER),
      }),
    );
    if (signUp.status !== 200) {
      throw new Error(`Sign-up failed: ${await signUp.text()}`);
    }
    const body = (await signUp.json()) as { user: { id: string } };
    userId = body.user.id;
  });

  afterAll(async () => {
    await auth.close();
    await testDatabase.destroy();
  });

  async function bindSubject(subject = SUBJECT): Promise<void> {
    const now = new Date();
    await database
      .connection()
      .query.insertInto('externalIdentities')
      .values({
        id: randomUUID(),
        providerIssuer: ISSUER,
        providerSubject: subject,
        localUserId: userId,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  async function clearBindings(): Promise<void> {
    await database
      .connection()
      .query.deleteFrom('externalIdentities')
      .allowAllRows()
      .execute();
  }

  it('ALLOW: valid JWT with bound external identity returns 200 and native userId', async () => {
    await clearBindings();
    await bindSubject();
    const token = await signToken();
    const response = await router.request('/casdoorIdentity/me', {
      headers: { [CASDOOR_ACCESS_TOKEN_HEADER]: token },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        userId,
        credentialType: 'casdoor',
        credentialScheme: CASDOOR_ACCESS_TOKEN_SCHEME,
      },
    });
  });

  it('DENY unbound: valid JWT without externalIdentities row is rejected', async () => {
    await clearBindings();
    const token = await signToken();
    const response = await router.request('/casdoorIdentity/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { reason: 'SUBJECT_BINDING_REQUIRED' },
    });
  });

  it('DENY disabled: bound user disabled via UserAdministrationService is rejected', async () => {
    await clearBindings();
    await bindSubject();
    const users = createUserAdministrationService({
      connection: database.connection(),
      auth,
    });
    await users.disable(userId);

    const token = await signToken();
    const response = await router.request('/casdoorIdentity/me', {
      headers: { [CASDOOR_ACCESS_TOKEN_HEADER]: token },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { reason: 'ACCOUNT_DISABLED' },
    });

    await users.enable(userId);
  });
});
