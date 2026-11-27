import { randomBytes, randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';

import {
  bindMeetingOaSsoRuntime,
  getMeetingOaSsoRuntime,
} from '../../server/auth/oa-ltpa/runtime.js';
import { createStandaloneServer } from '../../server/standalone.js';
import { setOaSsoFetchForTests } from '../../server/meetings/oa/sso-validator.js';

const write = (body?: unknown, extraHeaders?: Record<string, string>) => ({
  method: 'POST' as const,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    ...extraHeaders,
  },
  body: body === undefined ? '{}' : JSON.stringify(body),
});

const SSO_CONFIG = {
  enabled: true,
  validateUrl:
    'https://oa.example.test/api/sys-authentication/loginService.do?method=getTokenLoginName',
  cookieName: 'LtpaToken',
  timeoutMs: 5_000,
  oaLoginUrl: 'https://oa.example.test/',
  validateMethod: 'GET' as const,
};

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  scope: 'test',
  server: {
    env: {
      DB_DIALECT: 'sqlite',
      DB_HOST: undefined,
      DB_PORT: undefined,
      DB_DATABASE: undefined,
      DB_USER: undefined,
      DB_USERNAME: undefined,
      DB_PASSWORD: undefined,
      DB_STORAGE: undefined,
      // App `.env` may disable SSO for local ops; keep this suite hermetic.
      MEETING_OA_SSO_ENABLED: undefined,
      MEETING_OA_SSO_VALIDATE_URL: undefined,
      MEETING_OA_SSO_COOKIE_NAME: undefined,
      MEETING_OA_SSO_TIMEOUT_MS: undefined,
      MEETING_OA_SSO_OA_LOGIN_URL: undefined,
      MEETING_OA_SSO_VALIDATE_METHOD: undefined,
    },
  },
  config: {
    logging: { enabled: false },
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
      emailAndPassword: { disableSignUp: false },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    meetingOaSso: SSO_CONFIG,
  },
});

async function createUserWithUsername(
  testApp: Parameters<typeof signIn>[0] & {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  },
  username: string,
) {
  const credentials = {
    name: username,
    username,
    email: `${username.replace(/[^a-z0-9]/gi, '')}-${randomUUID()}@meeting.example.test`,
    password: 'MeetingAccess123!',
  };
  expect(
    (await testApp.request('/auth/sign-up/email', write(credentials))).status,
  ).toBe(200);
  return credentials;
}

function mockOaLoginName(loginName: string, status = 200) {
  setOaSsoFetchForTests(
    vi.fn(async () =>
      status === 200
        ? Response.json({ loginName })
        : new Response('denied', { status }),
    ),
  );
}

test('status and probe routes declare OpenAPI and respect enablement', async ({
  app,
  request,
}) => {
  expect(
    findUndeclaredApiRoutes(app).filter((route) =>
      /meeting-oa-sso/.test(route.path),
    ),
  ).toEqual([]);

  const status = await request('/meeting-oa-sso/status');
  expect(status.status).toBe(200);
  expect(status.headers.get('cache-control')).toMatch(/no-store/i);
  await expect(status.json()).resolves.toEqual({
    data: {
      enabled: true,
      oaLoginUrl: 'https://oa.example.test/',
    },
  });

  const probeMissing = await request('/meeting-oa-sso/probe');
  await expect(probeMissing.json()).resolves.toEqual({
    data: { cookiePresent: false },
  });

  const probePresent = await request('/meeting-oa-sso/probe', {
    headers: { cookie: 'LtpaToken=probe-token' },
  });
  await expect(probePresent.json()).resolves.toEqual({
    data: { cookiePresent: true },
  });
});

test('disabled SSO hides readiness and refuses sign-in', async ({
  request,
}) => {
  const previous = getMeetingOaSsoRuntime();
  bindMeetingOaSsoRuntime({
    ...previous,
    resolveConfig: () => ({ ...SSO_CONFIG, enabled: false }),
  });
  try {
    const status = await request('/meeting-oa-sso/status');
    await expect(status.json()).resolves.toEqual({ data: { enabled: false } });
    const probe = await request('/meeting-oa-sso/probe');
    expect(probe.status).toBe(404);
    const signInResponse = await request(
      '/auth/sign-in/oa-ltpa',
      write({}, { cookie: 'LtpaToken=good' }),
    );
    expect(signInResponse.status).toBe(404);
    await expect(signInResponse.json()).resolves.toMatchObject({
      code: 'OA_SSO_NOT_ENABLED',
    });
  } finally {
    bindMeetingOaSsoRuntime(previous);
  }
});

test('sign-in without cookie returns OA_SESSION_REQUIRED and does not call OA', async ({
  request,
}) => {
  const fetchImpl = vi.fn();
  setOaSsoFetchForTests(fetchImpl);
  const response = await request('/auth/sign-in/oa-ltpa', write());
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toMatch(/no-store/i);
  await expect(response.json()).resolves.toMatchObject({
    code: 'OA_SESSION_REQUIRED',
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('sign-in rejects invalid OA session without creating a Meeting cookie', async ({
  request,
}) => {
  mockOaLoginName('ignored', 401);
  const response = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=bad' }),
  );
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    code: 'OA_SESSION_INVALID',
  });
  expect(response.headers.getSetCookie?.() ?? []).toEqual([]);
});

test('sign-in maps OA contract errors and timeouts', async ({ request }) => {
  setOaSsoFetchForTests(
    vi.fn(
      async () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    ),
  );
  const contract = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=tok' }),
  );
  expect(contract.status).toBe(502);
  await expect(contract.json()).resolves.toMatchObject({
    code: 'OA_CONTRACT_ERROR',
  });

  setOaSsoFetchForTests(
    vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }),
  );
  const unavailable = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=tok' }),
  );
  expect(unavailable.status).toBe(503);
  await expect(unavailable.json()).resolves.toMatchObject({
    code: 'OA_VALIDATION_UNAVAILABLE',
  });
});

test('normalized username matching succeeds for case and rejects prefix drift', async ({
  testApp,
  request,
}) => {
  await createUserWithUsername(testApp, 'smc-sz-hr21007');
  mockOaLoginName(' SMC-SZ-HR21007 ');
  const ok = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=good' }),
  );
  expect(ok.status).toBe(200);
  const cookies = ok.headers.getSetCookie?.() ?? [];
  expect(cookies.length).toBeGreaterThan(0);
  await expect(ok.json()).resolves.toMatchObject({
    user: { username: 'smc-sz-hr21007' },
  });

  mockOaLoginName('sz-hr21007');
  const rejected = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=good' }),
  );
  expect(rejected.status).toBe(403);
  await expect(rejected.json()).resolves.toMatchObject({
    code: 'MEETING_ACCOUNT_UNAVAILABLE',
  });
});

test('body identity fields cannot override OA verification', async ({
  testApp,
  request,
}) => {
  await createUserWithUsername(testApp, 'smc-sz-hr21008');
  mockOaLoginName('smc-sz-hr21008');
  const response = await request(
    '/auth/sign-in/oa-ltpa',
    write(
      { userId: 'forged', loginName: 'admin', username: 'admin' },
      { cookie: 'LtpaToken=good' },
    ),
  );
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    user: { username: 'smc-sz-hr21008' },
  });
});

test('disabled accounts and missing usernames are refused', async ({
  testApp,
  request,
}) => {
  await createUserWithUsername(testApp, 'smc-sz-hr21009');
  const connection = testApp.application.container
    .resolve(databaseManagerToken)
    .connection();
  await connection.query
    .updateTable('user')
    .set({ disabledAt: new Date() })
    .where('username', '=', 'smc-sz-hr21009')
    .execute();

  mockOaLoginName('smc-sz-hr21009');
  const disabled = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=good' }),
  );
  expect(disabled.status).toBe(403);
  await expect(disabled.json()).resolves.toMatchObject({
    code: 'MEETING_ACCOUNT_UNAVAILABLE',
  });

  mockOaLoginName('nobody-here');
  const missing = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=good' }),
  );
  expect(missing.status).toBe(403);
});

test('session conflict keeps the existing Meeting session', async ({
  testApp,
  request,
}) => {
  const first = await createUserWithUsername(testApp, 'smc-sz-hr21010');
  await createUserWithUsername(testApp, 'smc-sz-hr21011');
  const signed = await signIn(testApp, first);
  mockOaLoginName('smc-sz-hr21011');
  const conflict = await request(
    '/auth/sign-in/oa-ltpa',
    write(
      {},
      {
        cookie: `LtpaToken=good; ${signed.cookie}`,
      },
    ),
  );
  expect(conflict.status).toBe(409);
  await expect(conflict.json()).resolves.toMatchObject({
    code: 'SESSION_CONFLICT',
  });

  mockOaLoginName('smc-sz-hr21010');
  const reuse = await request(
    '/auth/sign-in/oa-ltpa',
    write(
      {},
      {
        cookie: `LtpaToken=good; ${signed.cookie}`,
      },
    ),
  );
  expect(reuse.status).toBe(200);
  await expect(reuse.json()).resolves.toMatchObject({
    user: { username: 'smc-sz-hr21010' },
  });
});

test('CSRF without origin is rejected', async ({ testApp, request }) => {
  mockOaLoginName('smc-sz-hr21012');
  await createUserWithUsername(testApp, 'smc-sz-hr21012');
  const response = await request('/auth/sign-in/oa-ltpa', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'LtpaToken=good',
    },
    body: '{}',
  });
  expect([403, 401]).toContain(response.status);
});

test('ambiguous cookie values return INVALID_SSO_REQUEST', async ({
  request,
}) => {
  const response = await request(
    '/auth/sign-in/oa-ltpa',
    write({}, { cookie: 'LtpaToken=one; LtpaToken=two' }),
  );
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: 'INVALID_SSO_REQUEST',
  });
});

test.afterEach(() => {
  setOaSsoFetchForTests(undefined);
});
