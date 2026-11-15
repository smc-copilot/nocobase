import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    logging: { enabled: false },
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
      emailAndPassword: { disableSignUp: false },
    },
  },
});

const write = (body: unknown) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
  },
  body: JSON.stringify(body),
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

async function insertMeeting(
  connection: {
    repository: (name: string) => {
      createOne: (input: {
        values: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  },
  values: {
    id: string;
    title: string;
    meetingCode?: string;
  },
) {
  const now = new Date();
  await connection.repository('meetings').createOne({
    values: {
      ...values,
      sourceGatewayInstance: 'test-gateway',
      sourceOrganization: 'test-org',
      sourceConnectionRef: 'test-connection',
      sourceUpstreamMeetingId: values.id,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function grantAccess(
  connection: {
    repository: (name: string) => {
      createOne: (input: {
        values: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  },
  meetingId: string,
  userId: string,
  canRead = true,
) {
  const now = new Date();
  await connection.repository('meetingAccess').createOne({
    values: {
      id: randomUUID(),
      meetingId,
      userId,
      canRead,
      canWrite: false,
      createdAt: now,
      updatedAt: now,
    },
  });
}

test('rejects unauthenticated meeting reads', async ({ app, request }) => {
  expect((await request('/healthz')).status).toBe(200);
  expect(
    findUndeclaredApiRoutes(app).filter((route) =>
      route.path.includes('meetings'),
    ),
  ).toEqual([]);
  expect((await request('/meetings')).status).toBe(401);
  expect((await request('/meetings/missing')).status).toBe(401);
});

test('does not grant meeting reads to accounts managers or unsigned roles', async ({
  testApp,
  connection,
}) => {
  const authz = testApp.application.container.resolve(authorizationToken);
  const manager = await createUser(testApp, 'manager');
  const stranger = await createUser(testApp, 'stranger');
  await authz.permissionSets.assign({
    id: randomUUID(),
    permissionSet: 'accounts-manager',
    subject: { type: 'user', id: manager.user.id },
  });
  await insertMeeting(connection, {
    id: 'meeting-admin-hidden',
    title: 'Secret board',
    meetingCode: 'hidden-code',
  });
  await grantAccess(connection, 'meeting-admin-hidden', manager.user.id);
  expect(
    (
      await authz
        .for({ principal: { type: 'user', id: manager.user.id } })
        .authorize({
          resource: { type: 'composite', id: 'meeting' },
          action: 'read',
        })
    ).effect,
  ).toBe('deny');
  const managerList = await manager.fetch('/meetings');
  expect(managerList.status).toBe(403);
  const managerListBody = (await managerList.json()) as {
    error?: { reason?: string; message?: string };
  };
  expect(managerListBody.error?.reason).toBe('AUTHORIZATION_DENIED');
  expect(JSON.stringify(managerListBody)).not.toContain('Secret board');
  expect(JSON.stringify(managerListBody)).not.toContain('hidden-code');
  expect((await stranger.fetch('/meetings')).status).toBe(403);
  expect((await manager.fetch('/meetings/meeting-admin-hidden')).status).toBe(
    403,
  );
});

test('lists only meetings granted through record access', async ({
  testApp,
  connection,
}) => {
  const authz = testApp.application.container.resolve(authorizationToken);
  const alice = await createUser(testApp, 'alice');
  const bob = await createUser(testApp, 'bob');
  await authz.permissionSets.assign({
    id: randomUUID(),
    permissionSet: 'meeting-operator',
    subject: { type: 'user', id: alice.user.id },
  });
  await authz.permissionSets.assign({
    id: randomUUID(),
    permissionSet: 'meeting-operator',
    subject: { type: 'user', id: bob.user.id },
  });
  await insertMeeting(connection, {
    id: 'meeting-alice',
    title: 'Alice planning',
    meetingCode: 'alice-code',
  });
  await insertMeeting(connection, {
    id: 'meeting-bob',
    title: 'Bob planning',
    meetingCode: 'bob-code',
  });
  await grantAccess(connection, 'meeting-alice', alice.user.id);
  await grantAccess(connection, 'meeting-bob', bob.user.id);
  const aliceDecision = await authz
    .for({ principal: { type: 'user', id: alice.user.id } })
    .authorize({
      resource: { type: 'composite', id: 'meeting' },
      action: 'read',
    });
  expect(aliceDecision.effect).not.toBe('deny');
  expect(aliceDecision.conditions?.database?.meetings?.read).not.toBe(true);
  expect(aliceDecision.conditions?.database?.meetings?.read).toEqual(
    expect.objectContaining({
      fields: expect.arrayContaining([
        'id',
        'title',
        'meetingCode',
        'createdAt',
      ]),
    }),
  );
  const aliceList = await alice.fetch('/meetings');
  expect(aliceList.status).toBe(200);
  const aliceBody = (await aliceList.json()) as {
    data: { id: string; title: string; meetingCode: string }[];
    meta: { total: number };
  };
  expect(aliceBody.meta.total).toBe(1);
  expect(aliceBody.data).toEqual([
    expect.objectContaining({
      id: 'meeting-alice',
      title: 'Alice planning',
      meetingCode: 'alice-code',
    }),
  ]);
  expect(JSON.stringify(aliceBody)).not.toContain('Bob planning');
  expect((await alice.fetch('/meetings/meeting-bob')).status).toBe(403);
  const bobOne = await bob.fetch('/meetings/meeting-bob');
  expect(bobOne.status).toBe(200);
  expect(await bobOne.json()).toMatchObject({
    data: { id: 'meeting-bob', title: 'Bob planning' },
  });
  const emptyOperator = await createUser(testApp, 'empty');
  await authz.permissionSets.assign({
    id: randomUUID(),
    permissionSet: 'meeting-operator',
    subject: { type: 'user', id: emptyOperator.user.id },
  });
  const emptyList = await emptyOperator.fetch('/meetings');
  expect(emptyList.status).toBe(200);
  expect(await emptyList.json()).toMatchObject({
    data: [],
    meta: { total: 0, page: 1, pageSize: 20 },
  });
});

test('does not assign meeting roles to every signed-in user', async ({
  connection,
}) => {
  const globalAssignments = await connection.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['subjectType', 'subjectId', 'permissionSetKey'])
    .where('permissionSetKey', 'in', ['meeting-operator', 'accounts-manager'])
    .execute();
  expect(
    globalAssignments.filter(
      (assignment) =>
        assignment.subjectId === '*' ||
        assignment.subjectType === 'authenticated' ||
        assignment.subjectType === 'everyone',
    ),
  ).toEqual([]);
});
