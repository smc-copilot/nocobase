import { randomBytes, randomUUID } from 'node:crypto';

process.env.MEETING_GATEWAY_ORIGIN = 'https://from-env.example.test';
process.env.MEETING_GATEWAY_ORIGIN_ALLOWLIST = 'https://from-env.example.test';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';

const json = (method: 'PUT', body: unknown) => ({
  method,
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
      testAdapter: false,
      origin: 'https://from-env.example.test',
      originAllowlist: ['https://from-env.example.test'],
      applicationId: 'app-meeting',
    },
  },
});

test('gateway origin is environment-only; PUT config is rejected', async ({
  testApp,
}) => {
  const credentials = {
    name: 'ada',
    email: `ada-${randomUUID()}@meeting.example.test`,
    password: 'MeetingAccess123!',
  };
  expect(
    (
      await testApp.request('/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify(credentials),
      })
    ).status,
  ).toBe(200);
  const ada = await signIn(testApp, credentials);
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      id: randomUUID(),
      permissionSet: 'meeting-operator',
      subject: { type: 'user', id: ada.user.id },
    });
  const before = await ada.fetch('/meetingGateway/config');
  expect(before.status).toBe(200);
  expect(await before.json()).toMatchObject({
    data: {
      origin: 'https://from-env.example.test',
      originSource: 'env',
    },
  });
  const saved = await ada.fetch(
    '/meetingGateway/config',
    json('PUT', { origin: 'https://saved.example.test' }),
  );
  expect(saved.status).toBe(400);
  expect(await saved.json()).toMatchObject({
    error: { reason: 'GATEWAY_SETTINGS_INVALID' },
  });
  const again = await ada.fetch('/meetingGateway/config');
  expect(await again.json()).toMatchObject({
    data: {
      origin: 'https://from-env.example.test',
      originSource: 'env',
    },
  });
});
