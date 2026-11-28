import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import { casdoorIdentityAdminToken } from '@nocobase/app-plugin-casdoor-identity/server/tokens';
import { AppConfig, defaultAppConfigs } from '@nocobase/app-server/config';
import { createAppTest } from '@nocobase/app-testing/server';
import { databaseManagerToken } from '@nocobase/db';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import casdoorIdentity, {
  readMeetingCasdoorBrowserConfig,
} from '../../server/config/casdoor-identity.js';
import { createStandaloneServer } from '../../server/standalone.js';

const issuer = 'https://issuer.meeting.example.test';
const origin = 'https://app.meeting.example.test';
const clientId = 'meeting-test-client';
const clientSecret = 'test-secret-not-for-public-config';
const env = {
  CASDOOR_BROWSER_SIGN_IN_ENABLED: 'true',
  CASDOOR_ISSUER: issuer,
  CASDOOR_CLIENT_ID: clientId,
  CASDOOR_CLIENT_SECRET: clientSecret,
};
const discovery = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  id_token_signing_alg_values_supported: ['RS256'],
  code_challenge_methods_supported: ['S256'],
};
const key = await generateKeyPair('RS256');
const untrustedKey = await generateKeyPair('RS256');
const jwk = {
  ...(await exportJWK(key.publicKey)),
  kid: 'fixture',
  alg: 'RS256',
};
const fetchOriginal = globalThis.fetch;
let tokenResponse: Record<string, unknown>;
let tokenRequests = 0;
beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.origin !== issuer) return fetchOriginal(input, init);
      if (url.pathname.endsWith('/.well-known/openid-configuration')) {
        assert.ok(init?.redirect === 'error' || init?.redirect === 'manual');
        return Response.json(discovery);
      }
      if (url.pathname === '/jwks') return Response.json({ keys: [jwk] });
      if (url.pathname === '/token') {
        tokenRequests++;
        assert.equal(init?.redirect, 'error');
        assert.equal(init?.method, 'POST');
        const body = init?.body;
        assert.ok(body instanceof URLSearchParams);
        assert.equal(body.get('client_secret'), clientSecret);
        assert.equal(body.get('client_id'), clientId);
        assert.ok(body.get('code_verifier'));
        return Response.json(tokenResponse);
      }
      throw new Error('Unexpected mocked provider endpoint.');
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

it('opts in only with a complete dedicated client and canonical HTTPS issuer', () => {
  for (const override of [
    { CASDOOR_BROWSER_SIGN_IN_ENABLED: undefined },
    { CASDOOR_CLIENT_SECRET: undefined },
    { CASDOOR_ISSUER: 'http://issuer.meeting.example.test' },
    { CASDOOR_ISSUER: `${issuer}/` },
    { CASDOOR_ISSUER: 'https://user@issuer.meeting.example.test' },
  ])
    expect(
      readMeetingCasdoorBrowserConfig({ ...env, ...override }),
    ).toBeUndefined();
  expect(readMeetingCasdoorBrowserConfig(env)).toEqual({
    issuer,
    clientId,
    clientSecret,
  });
});

it('keeps the optional Casdoor settings private and valid when not configured', async () => {
  const appConfig = new AppConfig();
  await appConfig.loadAll();
  const sections = defaultAppConfigs({ casdoorIdentity });
  appConfig.mergeDefaults(sections({ env: {} } as never));
  appConfig.defineSections(sections.sections!);
  await appConfig.loadSectionEnvironment({});
  expect(await appConfig.validate()).toEqual([]);
  for (const key of Object.keys(env)) {
    expect(appConfig.environmentVariableMappings()[key]).toMatchObject({
      required: false,
    });
  }
  expect(
    appConfig.environmentVariableMappings().CASDOOR_CLIENT_SECRET,
  ).toMatchObject({
    secret: true,
  });
  expect(appConfig.publicValues().casdoorIdentity).toEqual({
    browserSignIn: false,
  });
});

const config = {
  logging: { enabled: false },
  app: { publicOrigin: origin },
  auth: {
    secret: 'test-auth-secret-at-least-32-characters',
    trustedOrigins: [origin],
    emailAndPassword: { disableSignUp: true },
  },
  secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
};
const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  server: { env },
  config,
});
const mismatchTest = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  server: { env: { ...env, CASDOOR_ISSUER: `${issuer}/mismatched` } },
  config,
});

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify(body),
});
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
const callbackURL = `${origin}/main/meetings`;
const errorCallbackURL = `${origin}/main/login?casdoor=failed`;

function signedIdToken(
  nonce: string | null,
  overrides: Partial<JWTPayload> = {},
  forged = false,
) {
  return new SignJWT({
    iss: issuer,
    aud: clientId,
    sub: 'known-casdoor-subject',
    iat: Math.floor(Date.now() / 1_000),
    exp: Math.floor(Date.now() / 1_000) + 180,
    nonce,
    owner: 'test-org',
    name: 'External name is not copied',
    email: 'meeting-user@example.test',
    employeeNo: 'meeting-user',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .sign(forged ? untrustedKey.privateKey : key.privateKey);
}

mismatchTest(
  'mismatched discovery disables Casdoor without disabling password sign-in',
  async ({ app, request }) => {
    const credentials = {
      email: 'emergency@example.test',
      password: 'emergency-test-password',
    };
    await app.container
      .resolve(userAdministrationServiceToken)
      .create({ name: 'Emergency', ...credentials });
    const sso = await request(
      '/auth/sign-in/social',
      post({ provider: 'casdoor', callbackURL }),
    );
    assert.equal(sso.status, 404);
    const local = await request('/auth/sign-in/email', post(credentials));
    assert.equal(local.status, 200);
  },
);

test('Better Auth code flow verifies before session; only admitted pre-bound humans can sign in', async ({
  app,
  request,
}) => {
  expect(app.config.publicValues().casdoorIdentity).toEqual({
    browserSignIn: true,
  });
  const admin = app.container.resolve(casdoorIdentityAdminToken);
  const users = app.container.resolve(userAdministrationServiceToken);
  const user = await users.create({
    name: 'Local name',
    username: 'meeting-user',
    email: 'meeting-user@example.test',
    password: 'local-test-password',
  });
  const query = app.container.resolve(databaseManagerToken).connection().query;
  const accountRows = () =>
    query
      .selectFrom('account')
      .selectAll()
      .where('providerId', '=', 'casdoor')
      .execute();
  const attempts = async (
    makeTokens: (nonce: string | null) => Promise<Record<string, unknown>>,
  ) => {
    const start = await request(
      '/auth/sign-in/social',
      post({ provider: 'casdoor', callbackURL, errorCallbackURL }),
    );
    expect(start.status).toBe(200);
    const authorize = new URL(((await start.json()) as { url: string }).url);
    expect(authorize.origin).toBe(issuer);
    expect(authorize.searchParams.get('client_id')).toBe(clientId);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('redirect_uri')).toMatch(
      /\/api\/auth\/callback\/casdoor$/,
    );
    const nonce = authorize.searchParams.get('nonce');
    expect(nonce).toBeTruthy();
    tokenResponse = await makeTokens(nonce);
    const state = authorize.searchParams.get('state');
    return request(
      `/auth/callback/casdoor?code=fixture-code&state=${encodeURIComponent(state!)}`,
      {
        headers: { cookie: cookies(start) },
      },
    );
  };
  const accept = (nonce: string | null) =>
    signedIdToken(nonce).then((id_token) => ({
      id_token,
      access_token: 'not-stored',
      refresh_token: 'not-stored',
    }));
  const assertDenied = async (response: Response) => {
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(errorCallbackURL);
    expect(
      response.headers
        .getSetCookie()
        .some((cookie) => /session_token/.test(cookie)),
    ).toBe(false);
  };

  await assertDenied(await attempts(accept)); // No provider policy.
  await admin.providers.upsert(
    {
      providerId: 'meeting-casdoor',
      issuer,
      enabled: true,
      admissionPolicy: { allowOrganizations: ['test-org'] },
    },
    null,
  );
  await assertDenied(await attempts(accept)); // No binding, even with matching employee number/email.
  expect(await accountRows()).toEqual([]);
  expect(
    await query.selectFrom('externalIdentities').select('id').execute(),
  ).toEqual([]);
  await admin.externalIdentities.commit(
    [{ issuer, subject: 'known-casdoor-subject', employeeNo: 'meeting-user' }],
    null,
  );

  for (const [claims, forged] of [
    [{ iss: 'https://different.example.test' }, false],
    [{ sub: ' ' }, false],
    [{ aud: 'portal-test-client' }, false],
    [{ aud: [clientId, 'portal-test-client'] }, false],
    [{ exp: 1 }, false],
    [{ nonce: 'wrong-nonce' }, false],
    [{}, true],
    [{ owner: 'other-org' }, false],
  ] as const)
    await assertDenied(
      await attempts(async (nonce) => ({
        id_token: await signedIdToken(
          nonce,
          claims as Partial<JWTPayload>,
          forged,
        ),
      })),
    );
  await assertDenied(
    await attempts(async (nonce) => ({
      access_token: await signedIdToken(nonce),
    })),
  );
  expect(await accountRows()).toEqual([]);
  const beforeDirect = tokenRequests;
  const direct = await request(
    '/auth/sign-in/social',
    post({
      provider: 'casdoor',
      idToken: {
        token: await signedIdToken('client-supplied'),
        nonce: 'client-supplied',
      },
    }),
  );
  expect(direct.status).toBe(403);
  expect(tokenRequests).toBe(beforeDirect);
  const headerToken = await signedIdToken('not-a-browser-flow');
  const auth = app.container.resolve(authenticationToken);
  for (const headers of [
    { 'x-casdoor-access-token': headerToken },
    { authorization: `Bearer ${headerToken}` },
  ])
    expect(
      (await request('/casdoorIdentity/me', { headers: new Headers(headers) }))
        .status,
    ).toBe(401);

  let sessionHeaders = new Headers();
  for (let index = 0; index < 2; index++) {
    const success = await attempts(accept);
    expect(success.status).toBe(302);
    expect(success.headers.get('location')).toBe(callbackURL);
    sessionHeaders = new Headers({ cookie: cookies(success) });
    const session = await auth.getSession(sessionHeaders);
    expect(session?.user).toMatchObject({ id: user.id, name: 'Local name' });
  }
  expect((await request('/meetings', { headers: sessionHeaders })).status).toBe(
    403,
  );
  const accounts = await accountRows();
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({
    userId: user.id,
    accountId: 'known-casdoor-subject',
    accessToken: null,
    refreshToken: null,
    idToken: null,
  });
  await users.disable(user.id);
  expect(await auth.getSession(sessionHeaders)).toBeNull();
  await assertDenied(await attempts(accept));
});
