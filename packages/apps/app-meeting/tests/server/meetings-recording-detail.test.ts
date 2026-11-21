import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import type { GatewayRecordFileDetail } from '../../server/meetings/gateway/adapter.js';
import { TestMeetingGatewayAdapter } from '../../server/meetings/gateway/test-adapter.js';
import { meetingGatewayAdapterToken } from '../../server/meetings/gateway/token.js';

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

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
  // Keep the provisioned SQLite dialect: the app `.env` sets DB_DIALECT=postgres.
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
    meetingGateway: {
      testAdapter: true,
      origin: 'https://gateway.example.test',
      originAllowlist: ['https://gateway.example.test'],
      applicationId: 'app-meeting',
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

async function insertMeeting(
  connection: {
    repository: (name: string) => {
      createOne: (input: {
        values: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  },
  values: { id: string; title: string; recordFileId?: string },
  userId: string,
) {
  const now = new Date();
  await connection.repository('meetings').createOne({
    values: {
      id: values.id,
      title: values.title,
      sourceGatewayInstance: 'test-gateway',
      sourceOrganization: 'test-org',
      sourceConnectionRef: CONNECTION_ID,
      sourceUpstreamMeetingId: values.id,
      sourceCycleKey: '',
      startedAt: now,
      importState: 'not_imported',
      queryAnomaly: null,
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
  if (values.recordFileId) {
    await connection.repository('meetingRecordings').createOne({
      values: {
        id: randomUUID(),
        meetingId: values.id,
        recordFileId: values.recordFileId,
        available: true,
        format: 'txt',
        unavailableReason: null,
        sharingUrl: null,
        allowDownload: true,
        importability: 'importable',
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}

function gateway(app: {
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
      connectionId: CONNECTION_ID,
      applicationId: 'app-meeting',
      name: 'Alice Tencent',
      memberId: '22222222-2222-4222-8222-222222222222',
      type: 'THIRD_PARTY_OAUTH',
      status: 'ACTIVE',
    },
  ];
  return value;
}

async function bind(session: {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const started = (
    await session
      .fetch('/meetingGateway/bindings/start', write({}))
      .then(async (response) => {
        const body: unknown = await response.json();
        if (response.status !== 200) {
          throw new Error(`bind start failed: ${JSON.stringify(body)}`);
        }
        return body as { data: { state: string } };
      })
  ).data;
  const complete = await session.fetch(
    '/meetingGateway/bindings/complete',
    write({ state: started.state }),
  );
  if (complete.status !== 200) {
    throw new Error(
      `bind complete failed: ${JSON.stringify(await complete.json())}`,
    );
  }
}

const previewDetail: GatewayRecordFileDetail = {
  recordFileId: 'rec-meet-a',
  viewAddress: 'https://meeting.tencent.com/view',
  downloadAddress: 'https://cos.ap-guangzhou.myqcloud.com/media.mp4',
  downloadAddressFileType: 'mp4',
  audioAddress: null,
  audioAddressFileType: null,
  meetingSummary: [
    {
      fileType: 'docx',
      downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/summary.docx',
      available: true,
    },
  ],
  aiMeetingTranscripts: [],
  aiMinutes: [],
  aiTopicMinutes: [],
  aiSpeakerMinutes: [],
  aiDsMinutes: [],
  recordInfo: [],
};

test('rejects a recording that belongs to another meeting and requires viewRecording', async ({
  app,
  testApp,
  connection,
  request,
}) => {
  expect(
    (await request('/meetings/meet-a/recordings/rec-meet-a/detail')).status,
  ).toBe(401);
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await insertMeeting(
    connection,
    { id: 'meet-a', title: 'Meeting A', recordFileId: 'rec-meet-a' },
    alice.user.id,
  );
  await insertMeeting(
    connection,
    { id: 'meet-b', title: 'Meeting B', recordFileId: 'rec-meet-b' },
    alice.user.id,
  );
  const adapter = gateway(app);
  await bind(alice);
  adapter.recordFileDetails.set('rec-meet-a', previewDetail);
  const crossed = await alice.fetch(
    '/meetings/meet-b/recordings/rec-meet-a/detail',
  );
  expect(crossed.status).toBe(404);
  expect(await crossed.json()).toMatchObject({
    error: { status: 'NOT_FOUND', reason: 'RECORDING_NOT_FOUND' },
  });

  const reader = await createUser(testApp, 'reader');
  await grant(testApp, reader.user.id, 'meeting-oa-operator');
  await insertMeeting(
    connection,
    { id: 'meet-read', title: 'Readable', recordFileId: 'rec-read' },
    reader.user.id,
  );
  expect((await reader.fetch('/meetings/meet-read')).status).toBe(200);
  const denied = await reader.fetch(
    '/meetings/meet-read/recordings/rec-read/detail',
  );
  expect(denied.status).toBe(403);
});

test('returns a no-store recording detail and does not persist signed URLs', async ({
  app,
  testApp,
  connection,
}) => {
  const alice = await createUser(testApp, 'alice');
  await grant(testApp, alice.user.id, 'meeting-operator');
  await insertMeeting(
    connection,
    { id: 'meet-detail', title: 'Detail', recordFileId: 'rec-detail' },
    alice.user.id,
  );
  const adapter = gateway(app);
  await bind(alice);
  adapter.recordFileDetails.set('rec-detail', {
    ...previewDetail,
    recordFileId: 'rec-detail',
  });
  const response = await alice.fetch(
    '/meetings/meet-detail/recordings/rec-detail/detail',
  );
  const body = (await response.json()) as {
    data: {
      meetingId: string;
      recordFileId: string;
      downloadAddress: string | null;
      meetingSummary: { fileType: string; available: boolean }[];
      fetchedAt: string;
    };
  };
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body.data).toMatchObject({
    meetingId: 'meet-detail',
    recordFileId: 'rec-detail',
    viewAddress: 'https://meeting.tencent.com/view',
    downloadAddress: 'https://cos.ap-guangzhou.myqcloud.com/media.mp4',
    meetingSummary: [
      {
        fileType: 'docx',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/summary.docx',
        available: true,
      },
    ],
  });
  expect(body.data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(JSON.stringify(body)).not.toMatch(/mt_/);
  const stored = await connection.repository('meetingRecordings').findMany({
    filter: { meetingId: 'meet-detail' },
  });
  expect(JSON.stringify(stored)).not.toContain('myqcloud');
  expect(JSON.stringify(stored)).not.toContain('meeting.tencent.com');
});
