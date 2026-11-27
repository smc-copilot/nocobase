import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';

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
    meetingGateway: { testAdapter: false },
  },
});

test('query without gateway configuration reports GATEWAY_NOT_CONFIGURED', async ({
  testApp,
}) => {
  const credentials = {
    name: 'alice',
    email: `alice-${randomUUID()}@meeting.example.test`,
    password: 'MeetingAccess123!',
  };
  expect(
    (await testApp.request('/auth/sign-up/email', write(credentials))).status,
  ).toBe(200);
  const alice = await signIn(testApp, credentials);
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      id: randomUUID(),
      permissionSet: 'meeting-operator',
      subject: { type: 'user', id: alice.user.id },
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
    error: { reason: 'GATEWAY_NOT_CONFIGURED' },
  });
});
