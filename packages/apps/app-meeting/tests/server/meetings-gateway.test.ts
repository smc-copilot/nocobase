import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { TestMeetingGatewayAdapter } from '../../server/meetings/gateway/test-adapter.js';
import { meetingGatewayAdapterToken } from '../../server/meetings/gateway/token.js';
import { MeetingGatewayError } from '../../server/meetings/gateway/errors.js';

const write = (body: unknown) => ({
  method: 'POST' as const,
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
      originAllowlist: ['https://gateway.example.test'],
      applicationId: 'app-meeting',
      expectedApplicationId: 'app-meeting',
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

async function grantOperator(
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
) {
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      id: randomUUID(),
      permissionSet: 'meeting-operator',
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

function assertNoSecrets(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/mt_/);
  expect(text).not.toMatch(/ms_/);
  expect(text).not.toContain('sealedAccessToken');
  expect(text).not.toContain('clientSecret');
  expect(text).not.toContain('nbs1');
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

async function bindUser(
  session: Awaited<ReturnType<typeof createUser>>,
): Promise<{ id: string; status: string; disconnectRevokesUpstream: boolean }> {
  const started = (await expectOk(
    await session.fetch('/meetingGateway/bindings/start', write({})),
  )) as { data: { state: string } };
  const bound = (await expectOk(
    await session.fetch(
      '/meetingGateway/bindings/complete',
      write({ state: started.data.state }),
    ),
  )) as {
    data: { id: string; status: string; disconnectRevokesUpstream: boolean };
  };
  return bound.data;
}

test('documents meeting gateway routes and keeps tokens off the wire', async ({
  app,
  testApp,
}) => {
  expect(
    findUndeclaredApiRoutes(app).filter((route) => /meeting/i.test(route.path)),
  ).toEqual([]);
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  adapter(app);
  const config = (await expectOk(
    await alice.fetch('/meetingGateway/config'),
  )) as { data: Record<string, unknown> };
  assertNoSecrets(config);
  expect(JSON.stringify(config)).not.toContain('gateway.example.test');
  expect(config.data).toMatchObject({
    testAdapter: true,
    queryHttpContract: 'unavailable',
    disconnectRevokesUpstream: false,
    rootUnrestrictedReadsAllMeetings: true,
  });
  const start = await alice.fetch('/meetingGateway/bindings/start', write({}));
  const started = (await expectOk(start)) as {
    data: { state: string; authorizationUrl: string };
  };
  assertNoSecrets(started);
  expect(started.data.authorizationUrl).toContain(
    'https://meeting.tencent.com/',
  );
  expect(decodeURIComponent(started.data.authorizationUrl)).toContain(
    `localState=${started.data.state}`,
  );
  const peek = await alice.fetch(
    `/meetingGateway/oauth/callback?state=${started.data.state}`,
  );
  expect((await expectOk(peek)) as { data: { status: string } }).toMatchObject({
    data: { status: 'pending_completion' },
  });
  const complete = await alice.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: started.data.state }),
  );
  const bound = (await expectOk(complete)) as { data: { status: string } };
  assertNoSecrets(bound);
  expect(bound.data.status).toBe('active');
});

test('rejects OAuth replay, cross-user complete and expired state', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  const bob = await createUser(testApp, 'bob');
  await grantOperator(testApp, alice.user.id);
  await grantOperator(testApp, bob.user.id);
  adapter(app);
  const started = (await expectOk(
    await alice.fetch('/meetingGateway/bindings/start', write({})),
  )) as { data: { state: string } };
  const replaySetup = await alice.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: started.data.state }),
  );
  const replaySetupBody = await replaySetup.json();
  if (replaySetup.status !== 200) {
    throw new Error(
      `expected 200, got ${String(replaySetup.status)}: ${JSON.stringify(replaySetupBody)}`,
    );
  }
  const replay = await alice.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: started.data.state }),
  );
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({
    error: { reason: 'OAUTH_STATE_REPLAYED' },
  });
  const second = (await (
    await alice.fetch('/meetingGateway/bindings/start', write({}))
  ).json()) as { data: { state: string } };
  const injected = await alice.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: second.data.state, userId: bob.user.id }),
  );
  expect(injected.status).toBe(400);
  const stolen = await bob.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: second.data.state }),
  );
  expect(stolen.status).toBe(400);
  expect(await stolen.json()).toMatchObject({
    error: { reason: 'OAUTH_STATE_INVALID' },
  });
  expect(
    (
      await alice.fetch(
        '/meetingGateway/bindings/complete',
        write({ state: second.data.state }),
      )
    ).status,
  ).toBe(200);
  const third = (await (
    await alice.fetch('/meetingGateway/bindings/start', write({}))
  ).json()) as { data: { state: string } };
  await connection.repository('meetingOauthStates').updateOne({
    filter: { id: third.data.state },
    values: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await alice.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: third.data.state }),
  );
  expect(expired.status).toBe(400);
  expect(await expired.json()).toMatchObject({
    error: { reason: 'OAUTH_STATE_EXPIRED' },
  });
});

test('disconnect blocks later remote query and does not claim upstream revoke', async ({
  app,
  testApp,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  const gateway = adapter(app);
  gateway.meetings = [
    {
      upstreamMeetingId: 'up-1',
      title: 'Planning',
      meetingCode: 'code-1',
      startedAt: '2026-11-01T01:00:00.000Z',
      endedAt: '2026-11-01T02:00:00.000Z',
      organizationId: 'org-1',
      connectionRef: 'conn-alice',
      cycleKey: 'c1',
    },
  ];
  const bound = await bindUser(alice);
  expect(bound.disconnectRevokesUpstream).toBe(false);
  const queried = await alice.fetch(
    '/meetingQueryRuns',
    write({
      startedAt: '2026-11-01T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:00.000Z',
    }),
  );
  expect(queried.status).toBe(200);
  const disconnected = await alice.fetch(
    `/meetingGateway/bindings/${bound.id}/disconnect`,
    write({}),
  );
  expect(disconnected.status).toBe(200);
  expect(await disconnected.json()).toMatchObject({
    data: { status: 'disconnected', disconnectRevokesUpstream: false },
  });
  const after = await alice.fetch(
    '/meetingQueryRuns',
    write({
      startedAt: '2026-11-01T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:00.000Z',
    }),
  );
  expect(after.status).toBe(400);
  expect(await after.json()).toMatchObject({
    error: { reason: 'GATEWAY_REAUTH_REQUIRED' },
  });
  const stored = await alice.fetch('/meetings');
  expect(stored.status).toBe(200);
  expect(await stored.json()).toMatchObject({
    data: [expect.objectContaining({ title: 'Planning' })],
  });
});

test('refuses a connection id that is not in the trusted list', async ({
  app,
  testApp,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  const gateway = adapter(app);
  gateway.connections = [
    {
      connectionId: 'conn-alice',
      applicationId: 'app-meeting',
      name: 'Alice Tencent',
      memberId: 'member-alice',
      type: 'THIRD_PARTY_OAUTH',
      status: 'PENDING_CONFIRMATION',
    },
    {
      connectionId: 'conn-alice-2',
      applicationId: 'app-meeting',
      name: 'Alice other',
      memberId: 'member-alice',
      type: 'THIRD_PARTY_OAUTH',
      status: 'ACTIVE',
    },
    {
      connectionId: 'conn-other',
      applicationId: 'someone-else',
      name: 'Foreign',
      memberId: 'member-other',
      type: 'THIRD_PARTY_OAUTH',
      status: 'ACTIVE',
    },
  ];
  const bound = await bindUser(alice);
  expect(bound.status).toBe('awaiting_connection');
  const tamper = await alice.fetch(
    `/meetingGateway/bindings/${bound.id}/select`,
    write({ connectionId: 'conn-other' }),
  );
  expect(tamper.status).toBe(400);
  expect(await tamper.json()).toMatchObject({
    error: { reason: 'CONNECTION_NOT_ALLOWED' },
  });
  const selected = (await expectOk(
    await alice.fetch(
      `/meetingGateway/bindings/${bound.id}/select`,
      write({ connectionId: 'conn-alice-2' }),
    ),
  )) as {
    data: { availableConnections: { connectionId: string }[] };
  };
  expect(
    selected.data.availableConnections.map((item) => item.connectionId).sort(),
  ).toEqual(['conn-alice', 'conn-alice-2']);
});

test('repeats a query without duplicating meetings and keeps rows after a later failure', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  const gateway = adapter(app);
  gateway.meetings = [
    {
      upstreamMeetingId: 'up-keep',
      title: 'Keep me',
      meetingCode: 'same-code',
      startedAt: null,
      endedAt: null,
      organizationId: 'org-1',
      connectionRef: 'conn-alice',
      cycleKey: 'cycle-a',
    },
    {
      upstreamMeetingId: 'up-keep',
      title: 'Other cycle',
      meetingCode: 'same-code',
      startedAt: null,
      endedAt: null,
      organizationId: 'org-1',
      connectionRef: 'conn-alice',
      cycleKey: 'cycle-b',
    },
  ];
  await bindUser(alice);
  const window = {
    startedAt: '2026-11-01T00:00:00.000Z',
    endedAt: '2026-11-02T00:00:00.000Z',
  };
  expect((await alice.fetch('/meetingQueryRuns', write(window))).status).toBe(
    200,
  );
  expect((await alice.fetch('/meetingQueryRuns', write(window))).status).toBe(
    200,
  );
  const list = (await (await alice.fetch('/meetings')).json()) as {
    data: { id: string; title: string }[];
    meta: { total: number };
  };
  expect(list.meta.total).toBe(2);
  expect(list.data.map((row) => row.title).sort()).toEqual([
    'Keep me',
    'Other cycle',
  ]);
  const stored = (await connection.repository('meetings').findMany({})) as {
    sourceGatewayInstance: string;
    meetingCode: string | null;
    sourceCycleKey: string;
  }[];
  expect(new Set(stored.map((row) => row.sourceGatewayInstance))).toEqual(
    new Set(['gw-test']),
  );
  expect(
    stored.map((row) => `${row.meetingCode}:${row.sourceCycleKey}`).sort(),
  ).toEqual(['same-code:cycle-a', 'same-code:cycle-b']);
  gateway.queryError = new MeetingGatewayError(
    'UPSTREAM_CONTRACT_ERROR',
    'boom',
    'UNAVAILABLE',
  );
  const failed = await alice.fetch('/meetingQueryRuns', write(window));
  expect(failed.status).toBe(503);
  const kept = (await (await alice.fetch('/meetings')).json()) as {
    meta: { total: number };
  };
  expect(kept.meta.total).toBe(2);
});

test('a successful participant refetch drops rows the upstream no longer returns', async ({
  app,
  testApp,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  const gateway = adapter(app);
  gateway.meetings = [
    {
      upstreamMeetingId: 'up-people',
      title: 'People',
      meetingCode: 'people',
      startedAt: null,
      endedAt: null,
      organizationId: 'org-1',
      connectionRef: 'conn-alice',
      cycleKey: '',
    },
  ];
  gateway.participants.set('up-people', [
    {
      upstreamParticipantId: 'p-old',
      displayName: 'Old',
      department: null,
      joinedAt: null,
    },
    {
      upstreamParticipantId: 'p-keep',
      displayName: 'Keep',
      department: null,
      joinedAt: null,
    },
  ]);
  await bindUser(alice);
  const window = {
    startedAt: '2026-11-01T00:00:00.000Z',
    endedAt: '2026-11-02T00:00:00.000Z',
  };
  expect((await alice.fetch('/meetingQueryRuns', write(window))).status).toBe(
    200,
  );
  const list = (await (await alice.fetch('/meetings')).json()) as {
    data: { id: string }[];
  };
  const meetingId = list.data[0]?.id as string;
  gateway.participants.set('up-people', [
    {
      upstreamParticipantId: 'p-keep',
      displayName: 'Keep',
      department: null,
      joinedAt: null,
    },
  ]);
  expect((await alice.fetch('/meetingQueryRuns', write(window))).status).toBe(
    200,
  );
  const people = (await (
    await alice.fetch(`/meetings/${meetingId}/participants`)
  ).json()) as { data: { displayName: string }[] };
  expect(people.data.map((row) => row.displayName)).toEqual(['Keep']);
});

test('hides titles from another user on list and detail', async ({
  app,
  testApp,
}) => {
  const alice = await createUser(testApp, 'alice');
  const bob = await createUser(testApp, 'bob');
  await grantOperator(testApp, alice.user.id);
  await grantOperator(testApp, bob.user.id);
  const gateway = adapter(app);
  gateway.meetings = [
    {
      upstreamMeetingId: 'secret',
      title: 'Secret board',
      meetingCode: 'hidden-code',
      startedAt: null,
      endedAt: null,
      organizationId: 'org-1',
      connectionRef: 'conn-alice',
      cycleKey: '',
    },
  ];
  await bindUser(alice);
  await alice.fetch(
    '/meetingQueryRuns',
    write({
      startedAt: '2026-11-01T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:00.000Z',
    }),
  );
  const aliceList = (await (await alice.fetch('/meetings')).json()) as {
    data: { id: string }[];
  };
  const meetingId = aliceList.data[0]?.id as string;
  const bobList = await bob.fetch('/meetings');
  expect(JSON.stringify(await bobList.json())).not.toContain('Secret board');
  const bobDetail = await bob.fetch(`/meetings/${meetingId}`);
  expect(bobDetail.status).toBe(403);
  const bobDetailBody = JSON.stringify(await bobDetail.json());
  expect(bobDetailBody).not.toContain('Secret board');
  expect(bobDetailBody).not.toContain('hidden-code');
  expect((await bob.fetch(`/meetings/${meetingId}/participants`)).status).toBe(
    403,
  );
  const aliceDetail = await alice.fetch(`/meetings/${meetingId}`);
  expect(aliceDetail.status).toBe(200);
  expect(await aliceDetail.json()).toMatchObject({
    data: { title: 'Secret board', meetingCode: 'hidden-code' },
  });
});

test('pages meetings from the stored total after a query', async ({
  app,
  testApp,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grantOperator(testApp, alice.user.id);
  const gateway = adapter(app);
  gateway.meetings = Array.from({ length: 3 }, (_, index) => ({
    upstreamMeetingId: `up-${index}`,
    title: `Meeting ${index}`,
    meetingCode: `code-${index}`,
    startedAt: null,
    endedAt: null,
    organizationId: 'org-1',
    connectionRef: 'conn-alice',
    cycleKey: '',
  }));
  await bindUser(alice);
  await alice.fetch(
    '/meetingQueryRuns',
    write({
      startedAt: '2026-11-01T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:00.000Z',
    }),
  );
  const page = (await (
    await alice.fetch('/meetings?page=2&pageSize=2')
  ).json()) as { data: unknown[]; meta: { page: number; total: number } };
  expect(page.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
  expect(page.data).toHaveLength(1);
});
