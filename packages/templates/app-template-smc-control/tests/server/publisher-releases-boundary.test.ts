import { randomUUID } from 'node:crypto';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { releasesAccessToken } from '@nocobase/app-plugin-releases/server/tokens';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import {
  PUBLISHER_SET,
  publisherAuthorizationGrants,
} from '../../server/lib/releases-permissions.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const request = (
  input: unknown,
  key = `${Date.now()}.${randomUUID()}`,
): RequestInit => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': key,
  },
  body: JSON.stringify(input),
});

/**
 * R35: non-root publisher needs both Authorization `page:rel-apps/access` and
 * ReleasesAccess.pages['rel-apps']; API scopes stay related-only (no delete).
 */
test('non-root publisher reaches rel-apps page and only related Apps', async ({
  testApp,
  app,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const authz = app.container.resolve(authorizationToken);

  const createSet = await admin.fetch(
    '/authorization/permissionSets',
    request({
      key: PUBLISHER_SET,
      title: 'Publisher',
      grants: publisherAuthorizationGrants(),
    }),
  );
  expect(createSet.status).toBe(201);

  const account = {
    name: 'Ship Owner',
    username: 'shipowner',
    email: 'shipowner@example.test',
    password: 'Publisher-test-123!',
    roleScopes: { app: [PUBLISHER_SET] },
  };
  const created = await admin.fetch('/users', request(account));
  expect(created.status).toBe(201);
  const user = (await created.json()).data as { id: string };
  expect(user.id).toBeTruthy();

  const publisher = await signIn(testApp, {
    username: account.username,
    password: account.password,
  });

  // Native page guard (page:rel-apps/access).
  const pageAllowed = await authz
    .for({ principal: { type: 'user', id: user.id } })
    .can({
      resource: { type: 'page', id: 'rel-apps' },
      action: 'access',
    });
  expect(pageAllowed).toBe(true);

  // ReleasesAccess dual mapping.
  const access = app.container.resolve(releasesAccessToken);
  const permissions = await access.permissionsOfUser(user.id);
  expect(permissions.pages['rel-apps']).toBe(true);
  expect(permissions.scopes['rel.apps/create']).toBe('all');
  expect(permissions.scopes['rel.apps/deploy']).toEqual({ users: [user.id] });
  expect(permissions.scopes['rel.apps/delete']).toBe('none');

  // Member without publisher set cannot open the page.
  const memberAccount = {
    name: 'Plain Member',
    username: 'plainmember',
    email: 'plainmember@example.test',
    password: 'Member-test-123!',
    roleScopes: { app: [] },
  };
  const memberCreated = await admin.fetch('/users', request(memberAccount));
  expect(memberCreated.status).toBe(201);
  const member = (await memberCreated.json()).data as { id: string };

  expect(
    await authz.for({ principal: { type: 'user', id: member.id } }).can({
      resource: { type: 'page', id: 'rel-apps' },
      action: 'access',
    }),
  ).toBe(false);
  expect((await access.permissionsOfUser(member.id)).pages['rel-apps']).toBe(
    false,
  );

  // Publisher can list releases Apps API; member without grants is forbidden.
  expect((await publisher.fetch('/releases/apps')).status).toBe(200);
  const memberSession = await signIn(testApp, {
    username: memberAccount.username,
    password: memberAccount.password,
  });
  expect((await memberSession.fetch('/releases/apps')).status).toBe(403);
});
