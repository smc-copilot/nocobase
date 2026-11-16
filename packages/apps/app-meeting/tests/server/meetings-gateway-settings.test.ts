import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { TestMeetingGatewayAdapter } from '../../server/meetings/gateway/test-adapter.js';
import { meetingGatewayAdapterToken } from '../../server/meetings/gateway/token.js';
import { loadMeetingGatewayRuntime } from '../../server/meetings/gateway/settings-service.js';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import type { MeetingGatewayConfig } from '../../server/config/meeting-gateway.js';

const write = (body: unknown) => ({
  method: 'POST' as const,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
  },
  body: JSON.stringify(body),
});

const put = (body: unknown) => ({
  method: 'PUT' as const,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
  },
  body: JSON.stringify(body),
});

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  scope: 'test',
  config: {
    logging: { enabled: false },
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
      emailAndPassword: { disableSignUp: false },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    meetingGateway: {
      testAdapter: true,
      origin: 'https://gateway.example.test',
      originAllowlist: [
        'https://gateway.example.test',
        'https://gateway-b.example.test',
      ],
      applicationId: 'app-meeting',
      expectedApplicationId: 'app-meeting',
      clientId: 'env-client',
      instanceId: 'gw-test',
    },
  },
});

async function createUser(
  app: Parameters<typeof signIn>[0] & {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  },
  name: string,
) {
  const credentials = {
    name,
    email: `${name}-${randomUUID()}@meeting.example.test`,
    password: 'MeetingAccess123!',
  };
  expect(
    (await app.request('/auth/sign-up/email', write(credentials))).status,
  ).toBe(200);
  return signIn(app, credentials);
}

async function grant(
  testApp: {
    application: {
      container: {
        resolve: (token: typeof authorizationToken) => {
          permissionSets: {
            assign: (input: {
              id: string;
              permissionSet: string;
              subject: { type: 'user'; id: string };
            }) => Promise<unknown>;
          };
        };
      };
    };
  },
  userId: string,
  permissionSet: string,
) {
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      id: randomUUID(),
      permissionSet,
      subject: { type: 'user', id: userId },
    });
}

function adapter(app: {
  container: {
    resolve: (
      token: typeof meetingGatewayAdapterToken,
    ) => TestMeetingGatewayAdapter;
  };
}): TestMeetingGatewayAdapter {
  const value = app.container.resolve(meetingGatewayAdapterToken);
  if (!(value instanceof TestMeetingGatewayAdapter)) {
    throw new Error('expected isolation test adapter');
  }
  value.reset();
  value.connections = [
    {
      connectionId: 'conn-alice',
      applicationId: 'app-meeting',
      name: 'Alice Tencent',
      memberId: 'member-alice',
      type: 'THIRD_PARTY_OAUTH',
      status: 'ACTIVE',
    },
  ];
  return value;
}

async function expectOk(response: Response): Promise<unknown> {
  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(
      `expected 200, got ${String(response.status)}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

test('documents gateway settings routes and keeps secrets off ordinary APIs', async ({
  app,
  testApp,
}) => {
  expect(
    findUndeclaredApiRoutes(app).filter((route) =>
      /meetingGateway/i.test(route.path),
    ),
  ).toEqual([]);
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  const config = await alice.fetch('/meetingGateway/config');
  expect(config.status).toBe(200);
  const configBody = await config.json();
  expect(JSON.stringify(configBody)).not.toContain('gateway.example.test');
  expect(JSON.stringify(configBody)).not.toContain('clientSecret');
  expect(JSON.stringify(configBody)).not.toContain('env-client');
  const denied = await alice.fetch('/meetingGateway/settings');
  expect(denied.status).toBe(403);
});

test('persists gateway settings, secret keep/update/clear, and source priority', async ({
  app,
  testApp,
  connection,
}) => {
  const admin = await createUser(testApp, 'admin');
  await grant(testApp, admin.user.id, 'meeting-oa-operator');
  const gateway = adapter(app);
  const startCalls = gateway.startCalls.length;
  const saved = (await expectOk(
    await admin.fetch(
      '/meetingGateway/settings',
      put({
        origin: 'https://gateway-b.example.test',
        applicationId: 'app-saved',
        clientId: 'saved-client',
        clientSecret: 'super-secret-gateway',
        resource: 'meetings',
        scopes: 'meetings.read meetings.write',
        publicBaseUrl: 'https://meetings.example.test',
        instanceId: 'gw-saved',
      }),
    ),
  )) as { data: Record<string, unknown> };
  expect(JSON.stringify(saved)).not.toContain('super-secret-gateway');
  expect(saved.data.origin).toBe('https://gateway-b.example.test');
  expect(saved.data.clientId).toBe('saved-client');
  expect(saved.data.hasSecret).toBe(true);
  expect(saved.data.savedDoesNotVerify).toBe(true);
  expect(saved.data.saveDoesNotBind).toBe(true);
  expect(saved.data).toMatchObject({
    sources: {
      origin: 'settings',
      applicationId: 'settings',
      clientId: 'settings',
      clientSecret: 'settings',
    },
    runtime: {
      origin: 'https://gateway-b.example.test',
      applicationId: 'app-saved',
      clientId: 'saved-client',
      instanceId: 'gw-saved',
      configured: true,
    },
  });
  expect(gateway.startCalls.length).toBe(startCalls);

  const operator = await createUser(testApp, 'operator');
  await grant(testApp, operator.user.id, 'meeting-operator');
  const operatorConfig = (await expectOk(
    await operator.fetch('/meetingGateway/config'),
  )) as { data: Record<string, unknown> };
  expect(operatorConfig.data.configured).toBe(true);
  expect(JSON.stringify(operatorConfig)).not.toContain(
    'gateway-b.example.test',
  );
  expect(JSON.stringify(operatorConfig)).not.toContain('super-secret-gateway');
  expect(JSON.stringify(operatorConfig)).not.toContain('saved-client');

  const kept = (await expectOk(
    await admin.fetch(
      '/meetingGateway/settings',
      put({ origin: 'https://gateway-b.example.test' }),
    ),
  )) as { data: Record<string, unknown> };
  expect(JSON.stringify(kept)).not.toContain('super-secret-gateway');
  expect(kept.data.hasSecret).toBe(true);
  expect(kept.data.clientId).toBe('saved-client');

  const runtime = await loadMeetingGatewayRuntime({
    connection,
    secrets: app.container.resolve(secretsServiceToken),
    deployment: app.config.get('meetingGateway') as MeetingGatewayConfig,
  });
  expect(runtime.origin).toBe('https://gateway-b.example.test');
  expect(runtime.clientId).toBe('saved-client');
  expect(runtime.clientSecret).toBe('super-secret-gateway');
  expect(runtime.sources.origin).toBe('settings');

  const cleared = (await expectOk(
    await admin.fetch('/meetingGateway/settings', put({ clientSecret: null })),
  )) as { data: Record<string, unknown> };
  expect(cleared.data.hasSecret).toBe(false);
  const afterClear = await loadMeetingGatewayRuntime({
    connection,
    secrets: app.container.resolve(secretsServiceToken),
    deployment: app.config.get('meetingGateway') as MeetingGatewayConfig,
  });
  expect(afterClear.clientSecret).toBeUndefined();
  expect(afterClear.sources.clientSecret).toBe('none');
});

test('rejects http origin, unknown allowlist origin, and does not expand the allowlist', async ({
  testApp,
}) => {
  const admin = await createUser(testApp, 'admin');
  await grant(testApp, admin.user.id, 'meeting-oa-operator');
  const httpOrigin = await admin.fetch(
    '/meetingGateway/settings',
    put({ origin: 'http://gateway.example.test' }),
  );
  expect(httpOrigin.status).toBe(400);
  const unknown = await admin.fetch(
    '/meetingGateway/settings',
    put({ origin: 'https://evil.example.test' }),
  );
  expect(unknown.status).toBe(400);
  const body = await unknown.json();
  expect(body).toMatchObject({
    error: { reason: 'INVALID_INPUT' },
  });
  const read = (await expectOk(
    await admin.fetch('/meetingGateway/settings'),
  )) as { data: { deployment: { originAllowlist: string[] } } };
  expect(read.data.deployment.originAllowlist).toEqual([
    'https://gateway.example.test',
    'https://gateway-b.example.test',
  ]);
  expect(read.data.deployment.originAllowlist).not.toContain(
    'https://evil.example.test',
  );
});

test('switching instance id isolates old bindings without reusing tokens', async ({
  app,
  testApp,
  connection,
}) => {
  const admin = await createUser(testApp, 'admin');
  const operator = await createUser(testApp, 'operator');
  await grant(testApp, admin.user.id, 'meeting-oa-operator');
  await grant(testApp, operator.user.id, 'meeting-operator');
  await expectOk(
    await admin.fetch(
      '/meetingGateway/settings',
      put({
        origin: null,
        applicationId: null,
        expectedApplicationId: null,
        clientId: null,
        clientSecret: null,
        resource: null,
        scopes: null,
        publicBaseUrl: null,
        tencentCorpId: null,
        tencentSdkId: null,
        callbackRef: null,
        instanceId: null,
      }),
    ),
  );
  adapter(app);
  const started = (await expectOk(
    await operator.fetch('/meetingGateway/bindings/start', write({})),
  )) as { data: { state: string } };
  const bound = (await expectOk(
    await operator.fetch(
      '/meetingGateway/bindings/complete',
      write({ state: started.data.state }),
    ),
  )) as { data: { id: string; status: string } };
  expect(bound.data.status).toBe('active');
  const before = await connection
    .repository('meetingGatewayBindings')
    .findOne({ filter: { id: bound.data.id } });
  expect(before).toMatchObject({
    gatewayInstanceId: 'gw-test',
    status: 'active',
  });
  expect(
    (before as { sealedAccessToken?: string }).sealedAccessToken,
  ).toBeTruthy();

  await expectOk(
    await admin.fetch('/meetingGateway/settings', put({ instanceId: 'gw-b' })),
  );
  const afterSwitch = (await expectOk(
    await operator.fetch('/meetingGateway/bindings'),
  )) as { data: { id: string; status: string } };
  expect(afterSwitch.data.id).toBe('none');
  const historical = await connection
    .repository('meetingGatewayBindings')
    .findOne({ filter: { id: bound.data.id } });
  expect(historical).toMatchObject({
    gatewayInstanceId: 'gw-test',
    status: 'active',
  });

  await expectOk(
    await admin.fetch(
      '/meetingGateway/settings',
      put({ instanceId: 'gw-test', applicationId: 'app-other' }),
    ),
  );
  const invalidated = await connection
    .repository('meetingGatewayBindings')
    .findOne({ filter: { id: bound.data.id } });
  expect(invalidated).toMatchObject({
    gatewayInstanceId: 'gw-test',
    status: 'disconnected',
  });
  expect(
    (invalidated as { sealedAccessToken?: string | null }).sealedAccessToken,
  ).toBeNull();
  const current = (await expectOk(
    await operator.fetch('/meetingGateway/bindings'),
  )) as { data: { status: string } };
  expect(current.data.status).toBe('disconnected');
});
