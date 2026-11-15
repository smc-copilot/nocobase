import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { TestMeetingOaAdapter } from '../../server/meetings/oa/test-adapter.js';
import { meetingOaAdapterToken } from '../../server/meetings/oa/token.js';
import { MeetingOaError } from '../../server/meetings/oa/errors.js';
import { TestMeetingGatewayAdapter } from '../../server/meetings/gateway/test-adapter.js';
import { meetingGatewayAdapterToken } from '../../server/meetings/gateway/token.js';

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

const patch = (body: unknown) => ({
  method: 'PATCH' as const,
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
      instanceId: 'gw-test',
    },
    meetingOa: { testAdapter: true },
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

async function insertMeeting(
  connection: {
    repository: (name: string) => {
      createOne: (input: {
        values: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  },
  values: { id: string; title: string },
  userId: string,
) {
  const now = new Date();
  await connection.repository('meetings').createOne({
    values: {
      ...values,
      sourceGatewayInstance: 'test-gateway',
      sourceOrganization: 'test-org',
      sourceConnectionRef: 'test-connection',
      sourceUpstreamMeetingId: values.id,
      sourceCycleKey: '',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  await connection.repository('meetingAccess').createOne({
    values: {
      id: randomUUID(),
      meetingId: values.id,
      userId,
      canRead: true,
      canWrite: false,
      createdAt: now,
      updatedAt: now,
    },
  });
  await connection.repository('meetingRecordings').createOne({
    values: {
      id: randomUUID(),
      meetingId: values.id,
      recordFileId: `rec-${values.id}`,
      available: true,
      format: 'txt',
      unavailableReason: null,
      createdAt: now,
      updatedAt: now,
    },
  });
}

function oaAdapter(app: {
  container: {
    resolve: (token: typeof meetingOaAdapterToken) => TestMeetingOaAdapter;
  };
}): TestMeetingOaAdapter {
  const value = app.container.resolve(meetingOaAdapterToken);
  if (!(value instanceof TestMeetingOaAdapter)) {
    throw new Error('expected isolation OA adapter');
  }
  value.reset();
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

test('saves an OA draft with zero adapter writes and keeps mapping optional', async ({
  app,
  testApp,
  connection,
}) => {
  expect(
    findUndeclaredApiRoutes(app).filter((route) =>
      /meetingOa|oa-draft|content/.test(route.path),
    ),
  ).toEqual([]);
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await insertMeeting(
    connection,
    { id: 'meet-draft', title: 'Draft meeting' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-draft/oa-draft'),
  )) as { data: { version: number; writesOa: false; title: string } };
  expect(draft.data.writesOa).toBe(false);
  expect(draft.data.title).toBe('Draft meeting');
  const saved = (await expectOk(
    await alice.fetch(
      '/meetings/meet-draft/oa-draft',
      put({
        expectedVersion: draft.data.version,
        title: 'Edited title',
        summary: 'Local minutes',
        tasks: [
          {
            clientTaskId: 'task-stable',
            title: 'Assigned follow-up',
            assigneeEmployeeNo: 'E1001',
          },
        ],
      }),
    ),
  )) as { data: { title: string; tasks: { clientTaskId: string }[] } };
  expect(saved.data.title).toBe('Edited title');
  expect(saved.data.tasks[0]?.clientTaskId).toBe('task-stable');
  expect(adapter.createMeetingCalls).toEqual([]);
  expect(adapter.uploadSummaryCalls).toEqual([]);
  expect(adapter.createTaskCalls).toEqual([]);
  const denied = await alice.fetch(
    '/meetingOa/operations',
    write({
      meetingId: 'meet-draft',
      requestId: randomUUID(),
      expectedDraftVersion: 2,
    }),
  );
  expect(denied.status).toBe(403);
  expect(adapter.createMeetingCalls).toEqual([]);
});

test('formal sync without mapping writes zero OA and same requestId replays', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-map', title: 'Mapped' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-map/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-map/oa-draft',
      put({
        expectedVersion: draft.data.version,
        summary: 'Minutes body',
      }),
    ),
  );
  const missing = await alice.fetch(
    '/meetingOa/operations',
    write({
      meetingId: 'meet-map',
      requestId: 'req-missing',
      expectedDraftVersion: 2,
    }),
  );
  expect(missing.status).toBe(400);
  const missingBody = (await missing.json()) as { error?: { reason?: string } };
  expect(missingBody.error?.reason).toBe('OA_MAPPING_MISSING');
  expect(adapter.createMeetingCalls).toEqual([]);

  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001', displayName: 'Alice' }),
    ),
  );
  const first = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-map',
        requestId: 'req-same',
        expectedDraftVersion: 2,
      }),
    ),
  )) as { data: { id: string; status: string; requestId: string } };
  expect(first.data.status).toBe('succeeded');
  expect(adapter.createMeetingCalls).toHaveLength(1);
  const replay = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-map',
        requestId: 'req-same',
        expectedDraftVersion: 2,
      }),
    ),
  )) as { data: { id: string } };
  expect(replay.data.id).toBe(first.data.id);
  expect(adapter.createMeetingCalls).toHaveLength(1);
  const other = await alice.fetch(
    '/meetingOa/operations',
    write({
      meetingId: 'meet-map',
      requestId: 'req-other',
      expectedDraftVersion: 2,
    }),
  );
  expect(other.status).toBe(409);
  const otherBody = (await other.json()) as { error?: { reason?: string } };
  expect(otherBody.error?.reason).toBe('OA_INTENT_EXISTS');
});

test('rejects uncontrolled delegation and records timeout as UNKNOWN without resend on GET', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  const bob = await createUser(testApp, 'bob');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await grant(testApp, bob.user.id, 'meeting-operator');
  await grant(testApp, bob.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-del', title: 'Delegate' },
    alice.user.id,
  );
  await insertMeeting(
    connection,
    { id: 'meet-bob', title: 'Bob meet' },
    bob.user.id,
  );
  const adapter = oaAdapter(app);
  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001' }),
    ),
  );
  const bobDraft = (await expectOk(
    await bob.fetch('/meetings/meet-bob/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await bob.fetch(
      '/meetings/meet-bob/oa-draft',
      put({ expectedVersion: bobDraft.data.version, summary: 'Bob minutes' }),
    ),
  );
  const cross = await bob.fetch(
    '/meetingOa/operations',
    write({
      meetingId: 'meet-bob',
      requestId: 'req-cross',
      expectedDraftVersion: 2,
      asPrincipalUserId: alice.user.id,
    }),
  );
  expect(cross.status).toBe(400);
  expect(
    ((await cross.json()) as { error?: { reason?: string } }).error?.reason,
  ).toBe('OA_DELEGATION_DENIED');
  expect(adapter.createMeetingCalls).toEqual([]);

  adapter.createMeetingError = new MeetingOaError(
    'OA_TIMEOUT',
    'OA timed out after the request was sent.',
    'UNAVAILABLE',
    'UNKNOWN',
  );
  const aliceDraft = (await expectOk(
    await alice.fetch('/meetings/meet-del/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-del/oa-draft',
      put({
        expectedVersion: aliceDraft.data.version,
        summary: 'Alice minutes',
      }),
    ),
  );
  const timed = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-del',
        requestId: 'req-timeout',
        expectedDraftVersion: 2,
      }),
    ),
  )) as { data: { id: string; status: string; writesOaOnGet: false } };
  expect(timed.data.status).toBe('unknown');
  expect(adapter.createMeetingCalls).toHaveLength(1);
  const read = (await expectOk(
    await alice.fetch(`/meetingOa/operations/${timed.data.id}`),
  )) as { data: { status: string; writesOaOnGet: false } };
  expect(read.data.writesOaOnGet).toBe(false);
  expect(read.data.status).toBe('unknown');
  expect(adapter.createMeetingCalls).toHaveLength(1);
  const resume = await alice.fetch(
    `/meetingOa/operations/${timed.data.id}/resume`,
    write({}),
  );
  expect(resume.status).toBe(400);
  expect(adapter.createMeetingCalls).toHaveLength(1);
  await grant(testApp, alice.user.id, 'meeting-oa-reconciler');
  await expectOk(
    await alice.fetch(
      `/meetingOa/operations/${timed.data.id}/reconcile`,
      write({
        conclusion: 'not_sent',
        evidence: 'adapter timeout; no OA id observed',
      }),
    ),
  );
  expect(adapter.createMeetingCalls).toHaveLength(1);
  adapter.createMeetingError = undefined;
  const recovered = (await expectOk(
    await alice.fetch(
      `/meetingOa/operations/${timed.data.id}/recover`,
      write({}),
    ),
  )) as { data: { status: string; creatorEmployeeNo: string } };
  expect(recovered.data.creatorEmployeeNo).toBe('E1001');
  expect(recovered.data.status).toBe('succeeded');
  expect(adapter.createMeetingCalls).toHaveLength(2);
});

test('records partial task results per clientTaskId and confirmed business failure', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-part', title: 'Partial' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001' }),
    ),
  );
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-part/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-part/oa-draft',
      put({
        expectedVersion: draft.data.version,
        summary: 'Minutes',
        tasks: [
          { clientTaskId: 'c-ok', title: 'One', assigneeEmployeeNo: 'E1001' },
          { clientTaskId: 'c-fail', title: 'Two', assigneeEmployeeNo: 'E1001' },
        ],
      }),
    ),
  );
  adapter.taskResults = [
    {
      clientTaskId: 'c-ok',
      status: 'succeeded',
      externalTaskId: 'oa-1',
      errorCode: null,
    },
    {
      clientTaskId: 'c-fail',
      status: 'failed_confirmed',
      externalTaskId: null,
      errorCode: 'OA_BUSINESS_REJECTED',
    },
  ];
  const result = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-part',
        requestId: 'req-part',
        expectedDraftVersion: 2,
      }),
    ),
  )) as {
    data: {
      status: string;
      tasks: { clientTaskId: string; status: string }[];
    };
  };
  expect(result.data.status).toBe('partial');
  expect(result.data.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ clientTaskId: 'c-ok', status: 'succeeded' }),
      expect.objectContaining({
        clientTaskId: 'c-fail',
        status: 'failed_confirmed',
      }),
    ]),
  );
});

test('does not overwrite local minutes on re-import and does not echo OA secrets', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-imp', title: 'Import' },
    alice.user.id,
  );
  const gateway = app.container.resolve(meetingGatewayAdapterToken);
  if (!(gateway instanceof TestMeetingGatewayAdapter)) {
    throw new Error('expected isolation gateway adapter');
  }
  gateway.reset();
  gateway.accessTokens.add('mt_test_token');
  gateway.connections = [
    {
      connectionId: 'conn-alice',
      applicationId: 'app-meeting',
      name: 'Alice Tencent',
      memberId: 'member-alice',
      type: 'THIRD_PARTY_OAUTH',
      status: 'ACTIVE',
    },
  ];
  oaAdapter(app);
  const started = (await expectOk(
    await alice.fetch('/meetingGateway/bindings/start', write({})),
  )) as { data: { state: string } };
  await expectOk(
    await alice.fetch(
      '/meetingGateway/bindings/complete',
      write({ state: started.data.state }),
    ),
  );
  const imported = (await expectOk(
    await alice.fetch(
      '/meetings/meet-imp/imports',
      write({ recordFileId: 'rec-meet-imp' }),
    ),
  )) as { data: { minutes: { text: string }; contentVersion: number } };
  expect(imported.data.minutes.text).toContain('Isolation source todo');
  await expectOk(
    await alice.fetch(
      '/meetings/meet-imp/content',
      patch({
        expectedContentVersion: imported.data.contentVersion,
        localMinutes: 'Human edited minutes',
      }),
    ),
  );
  const again = (await expectOk(
    await alice.fetch(
      '/meetings/meet-imp/imports',
      write({ recordFileId: 'rec-meet-imp' }),
    ),
  )) as {
    data: {
      minutes: { text: string; source: string };
      localMinutesEdited: boolean;
    };
  };
  expect(again.data.localMinutesEdited).toBe(true);
  expect(again.data.minutes.source).toBe('local');
  expect(again.data.minutes.text).toBe('Human edited minutes');

  const saved = (await expectOk(
    await alice.fetch(
      '/meetingOa/settings',
      put({
        peopleUrl: 'https://oa.example.test/people',
        clientSecret: 'super-secret-value',
      }),
    ),
  )) as { data: Record<string, unknown> };
  expect(JSON.stringify(saved)).not.toContain('super-secret-value');
  expect(saved.data.hasSecret).toBe(true);
  expect(saved.data.writeContract).toBe('test');
  const rootMap = await alice.fetch(
    '/meetingOa/identities',
    put({ userId: alice.user.id, employeeNo: 'root' }),
  );
  expect(rootMap.status).toBe(400);
  const urlImport = await alice.fetch(
    '/meetings/meet-imp/imports',
    write({ recordFileId: 'https://example.test/file.txt' }),
  );
  expect(urlImport.status).toBe(400);
});

test('treats confirmed unsent create as FAILED_CONFIRMED and resumes without a new intent', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-none', title: 'Unsent' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001' }),
    ),
  );
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-none/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-none/oa-draft',
      put({ expectedVersion: draft.data.version, summary: 'Minutes' }),
    ),
  );
  adapter.createMeetingError = new MeetingOaError(
    'OA_BUSINESS_REJECTED',
    'OA rejected the create before sending.',
    'FAILED_PRECONDITION',
    'NONE',
  );
  const failed = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-none',
        requestId: 'req-none',
        expectedDraftVersion: 2,
      }),
    ),
  )) as { data: { id: string; status: string } };
  expect(failed.data.status).toBe('failed_confirmed');
  expect(adapter.createMeetingCalls).toHaveLength(1);
  adapter.createMeetingError = undefined;
  const resumed = (await expectOk(
    await alice.fetch(
      `/meetingOa/operations/${failed.data.id}/resume`,
      write({}),
    ),
  )) as { data: { id: string; status: string } };
  expect(resumed.data.id).toBe(failed.data.id);
  expect(resumed.data.status).toBe('succeeded');
  expect(adapter.createMeetingCalls).toHaveLength(2);
});

test('records upload timeout as UNKNOWN and concurrent requestIds cannot open a second intent', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-up', title: 'Upload timeout' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001' }),
    ),
  );
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-up/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-up/oa-draft',
      put({ expectedVersion: draft.data.version, summary: 'Minutes' }),
    ),
  );
  adapter.uploadSummaryError = new MeetingOaError(
    'OA_TIMEOUT',
    'Upload timed out after send.',
    'UNAVAILABLE',
    'UNKNOWN',
  );
  const timed = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-up',
        requestId: 'req-up',
        expectedDraftVersion: 2,
      }),
    ),
  )) as {
    data: {
      id: string;
      status: string;
      steps: { stepKey: string; status: string; externalId: string | null }[];
    };
  };
  expect(timed.data.status).toBe('unknown');
  expect(adapter.createMeetingCalls).toHaveLength(1);
  expect(adapter.uploadSummaryCalls).toHaveLength(1);
  expect(
    timed.data.steps.find((step) => step.stepKey === 'createMeeting')?.status,
  ).toBe('succeeded');
  const read = await expectOk(
    await alice.fetch(`/meetingOa/operations/${timed.data.id}`),
  );
  expect((read as { data: { status: string } }).data.status).toBe('unknown');
  expect(adapter.uploadSummaryCalls).toHaveLength(1);
  const locked = await alice.fetch(
    '/meetings/meet-up/oa-draft',
    put({ expectedVersion: 2, summary: 'Changed after freeze' }),
  );
  expect(locked.status).toBe(400);
  expect(
    ((await locked.json()) as { error?: { reason?: string } }).error?.reason,
  ).toBe('OA_RESULT_UNKNOWN');

  await insertMeeting(
    connection,
    { id: 'meet-race', title: 'Race' },
    alice.user.id,
  );
  const raceDraft = (await expectOk(
    await alice.fetch('/meetings/meet-race/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-race/oa-draft',
      put({ expectedVersion: raceDraft.data.version, summary: 'Race minutes' }),
    ),
  );
  adapter.uploadSummaryError = undefined;
  const [first, second] = await Promise.all([
    alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-race',
        requestId: 'req-race-a',
        expectedDraftVersion: 2,
      }),
    ),
    alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-race',
        requestId: 'req-race-b',
        expectedDraftVersion: 2,
      }),
    ),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 409]);
});

test('marks missing task ids UNKNOWN and does not resend succeeded clientTaskIds', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-operator');
  await grant(testApp, alice.user.id, 'meeting-oa-reconciler');
  await insertMeeting(
    connection,
    { id: 'meet-miss', title: 'Missing task' },
    alice.user.id,
  );
  const adapter = oaAdapter(app);
  await expectOk(
    await alice.fetch(
      '/meetingOa/identities',
      put({ userId: alice.user.id, employeeNo: 'E1001' }),
    ),
  );
  const draft = (await expectOk(
    await alice.fetch('/meetings/meet-miss/oa-draft'),
  )) as { data: { version: number } };
  await expectOk(
    await alice.fetch(
      '/meetings/meet-miss/oa-draft',
      put({
        expectedVersion: draft.data.version,
        summary: 'Minutes',
        tasks: [
          { clientTaskId: 'keep', title: 'Keep', assigneeEmployeeNo: 'E1001' },
          { clientTaskId: 'lost', title: 'Lost', assigneeEmployeeNo: 'E1001' },
        ],
      }),
    ),
  );
  adapter.taskResults = [
    {
      clientTaskId: 'keep',
      status: 'succeeded',
      externalTaskId: 'oa-keep',
      errorCode: null,
    },
  ];
  const result = (await expectOk(
    await alice.fetch(
      '/meetingOa/operations',
      write({
        meetingId: 'meet-miss',
        requestId: 'req-miss',
        expectedDraftVersion: 2,
      }),
    ),
  )) as {
    data: {
      id: string;
      status: string;
      tasks: { clientTaskId: string; status: string }[];
    };
  };
  expect(result.data.status).toBe('unknown');
  expect(result.data.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ clientTaskId: 'keep', status: 'succeeded' }),
      expect.objectContaining({ clientTaskId: 'lost', status: 'unknown' }),
    ]),
  );
  expect(adapter.createTaskCalls).toHaveLength(1);
  await expectOk(
    await alice.fetch(
      `/meetingOa/operations/${result.data.id}/reconcile`,
      write({
        conclusion: 'not_sent',
        evidence: 'lost task was not observed in OA',
      }),
    ),
  );
  adapter.taskResults = undefined;
  const recovered = (await expectOk(
    await alice.fetch(
      `/meetingOa/operations/${result.data.id}/recover`,
      write({}),
    ),
  )) as {
    data: {
      status: string;
      tasks: {
        clientTaskId: string;
        status: string;
        externalTaskId: string | null;
      }[];
    };
  };
  expect(adapter.createTaskCalls).toHaveLength(2);
  expect(
    adapter.createTaskCalls[1]?.tasks.map((task) => task.clientTaskId),
  ).toEqual(['lost']);
  expect(recovered.data.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        clientTaskId: 'keep',
        status: 'succeeded',
        externalTaskId: 'oa-keep',
      }),
      expect.objectContaining({ clientTaskId: 'lost', status: 'succeeded' }),
    ]),
  );
});

test('caches isolation OA tokens until near expiry', async ({ app }) => {
  const adapter = oaAdapter(app);
  const first = await adapter.getToken('E1001');
  const second = await adapter.getToken('E1001');
  expect(second.expiresAt).toBe(first.expiresAt);
  adapter.clock = () => Date.parse(first.expiresAt) - 1_000;
  const refreshed = await adapter.getToken('E1001');
  expect(refreshed.expiresAt).not.toBe(first.expiresAt);
});
