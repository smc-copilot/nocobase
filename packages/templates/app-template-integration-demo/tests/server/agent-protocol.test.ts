// @vitest-environment node
/**
 * Gate A protocol HTTP regression with NocoBase-issued agentAccessToken
 * (replaces the Casdoor-forced N01–N06 baseline from V1.1).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  AGENT_ACCESS_TOKEN_HEADER,
  AGENT_ACCESS_TOKEN_SCHEME,
  agentAuthorizationServiceToken,
} from '@nocobase/app-plugin-agent-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { businessUiAdapterServiceToken } from '@nocobase/app-plugin-business-ui-adapter/server/tokens';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const OCTOP_ISSUER = 'https://octop.integration-demo.test';
const AUDIENCE = 'http://localhost';
const CONNECTION_ID = 'demo-site';
const SERVICE_SECRET = 'demo-connection-service-secret';
const PERMISSION_EDIT = 'generic.request:edit';
const FORM_EDIT = 'generic.request.edit';
const OCTOP_SUBJECT = 'octop-subject-alice';
const REDIRECT_URI = `${OCTOP_ISSUER}/oauth/callback`;

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: AUDIENCE },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    agentAuthorization: { audience: AUDIENCE },
  },
});

function protocolUrl(publicBasePath: string, suffix: string): string {
  const base = publicBasePath.replace(/\/$/, '');
  return `http://localhost${base}/business-ui/connections/${CONNECTION_ID}/v1${suffix}`;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
  return { verifier, challenge };
}

test('A18 protocol HTTP with agentAccessToken (N01–N06 replacement)', async ({
  testApp,
  app,
  request,
}) => {
  const services = app.container.resolve(businessUiAdapterServiceToken);
  const agent = app.container.resolve(agentAuthorizationServiceToken);
  const authz = app.container.resolve(authorizationToken);
  const users = app.container.resolve(userAdministrationServiceToken);

  const user = await users.create({
    name: 'Alice',
    email: 'alice@acme.test',
    password: 'password-at-least-8',
  });
  const userId = user.id;

  await authz.permissionSets.create({
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: '*' },
        actions: [{ action: 'edit' }, { action: 'view' }],
      },
    ],
  });
  await authz.permissionSets.assign({
    id: `user:${userId}:business-editor`,
    permissionSet: 'business-editor',
    subject: { type: 'user', id: userId },
  });

  const client = await agent.clients.create({
    name: 'Octop demo',
    redirectUris: [REDIRECT_URI],
    allowedScopes: ['business-ui:edit', 'business-ui:view'],
  });
  const grant = await agent.grants.createOrReuse({
    clientId: client.clientId,
    localUserId: userId,
    audience: AUDIENCE,
    scopes: ['business-ui:edit', 'business-ui:view'],
  });

  async function mintAccessToken(): Promise<string> {
    const { verifier, challenge } = pkcePair();
    const code = await agent.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grant.id,
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      scope: 'business-ui:edit business-ui:view',
    });
    const tokens = await agent.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
    });
    return tokens.access_token;
  }

  let token = await mintAccessToken();

  await services.upsertConnection({
    connectionId: CONNECTION_ID,
    clientId: client.clientId,
    octopIssuer: OCTOP_ISSUER,
    allowedOrigins: ['https://octop.integration-demo.test'],
    serviceSecret: SERVICE_SECRET,
    enabled: true,
  });
  await services.upsertForm({
    formRef: FORM_EDIT,
    schemaVersion: '1',
    mode: 'edit',
    handlerKey: 'generic-request',
    permissionRef: PERMISSION_EDIT,
  });

  const ticketBody = {
    formRef: FORM_EDIT,
    schemaVersion: '1',
    subject: { issuer: OCTOP_ISSUER, sub: OCTOP_SUBJECT },
    nonce: randomUUID(),
  };

  const ticketsUrl = protocolUrl(testApp.publicBasePath, '/tickets');
  const n01 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify(ticketBody),
    }),
  );
  expect(n01.status).toBe(200);
  const ticketJson = (await n01.json()) as {
    ticket: string;
    interactionId: string;
    operationId: string;
  };
  expect(ticketJson.ticket).toBeTruthy();

  const n02 = await request('/users', {
    headers: { [AGENT_ACCESS_TOKEN_HEADER]: token },
  });
  expect(n02.status).toBe(403);
  const n02Body = (await n02.json()) as { error?: { reason?: string } };
  expect(n02Body.error?.reason).toBe('CREDENTIAL_NOT_ACCEPTED');

  const saveUrl = protocolUrl(testApp.publicBasePath, '/documents/save');
  const saveDenied = await testApp.fetch(
    new Request(saveUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({}),
    }),
  );
  expect([401, 403]).toContain(saveDenied.status);

  const assignmentToRevoke = (
    await authz.permissionSets.listAssignments()
  ).find(
    (entry) =>
      entry.subject.type === 'user' &&
      entry.subject.id === userId &&
      (entry.permissionSet === 'business-editor' ||
        (entry as { key?: string }).key === 'business-editor'),
  );
  expect(assignmentToRevoke).toBeTruthy();
  await authz.permissionSets.revoke(assignmentToRevoke!.id);
  token = await mintAccessToken();
  const n03 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({ ...ticketBody, nonce: randomUUID() }),
    }),
  );
  expect(n03.status).toBe(403);

  await authz.permissionSets.assign({
    id: `user:${userId}:business-editor`,
    permissionSet: 'business-editor',
    subject: { type: 'user', id: userId },
  });
  token = await mintAccessToken();
  const n04Allow = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({ ...ticketBody, nonce: randomUUID() }),
    }),
  );
  expect(n04Allow.status).toBe(200);

  await authz.permissionSets.update('business-editor', {
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: 'rec-allowed' },
        actions: [{ action: 'edit' }],
      },
    ],
  });
  const n04Cross = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({
        ...ticketBody,
        nonce: randomUUID(),
        recordId: 'rec-other',
      }),
    }),
  );
  expect(n04Cross.status).toBe(403);

  const n04Own = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({
        ...ticketBody,
        nonce: randomUUID(),
        recordId: 'rec-allowed',
      }),
    }),
  );
  expect(n04Own.status).toBe(200);
  const n04Ticket = (await n04Own.json()) as {
    interactionId: string;
    operationId: string;
  };

  await authz.permissionSets.update('business-editor', {
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: '*' },
        actions: [{ action: 'edit' }, { action: 'view' }],
      },
    ],
  });

  const queryUrl = protocolUrl(
    testApp.publicBasePath,
    `/operations/${n04Ticket.operationId}`,
  );
  const n05 = await testApp.fetch(
    new Request(queryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: '{}',
    }),
  );
  expect(n05.status).toBe(200);

  const assignment = (await authz.permissionSets.listAssignments()).find(
    (entry) =>
      entry.subject.type === 'user' &&
      entry.subject.id === userId &&
      (entry.permissionSet === 'business-editor' ||
        (entry as { key?: string }).key === 'business-editor'),
  );
  expect(assignment).toBeTruthy();
  await authz.permissionSets.revoke(assignment!.id);
  token = await mintAccessToken();
  const n06 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AGENT_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({ ...ticketBody, nonce: randomUUID() }),
    }),
  );
  expect(n06.status).toBe(403);
  expect(AGENT_ACCESS_TOKEN_SCHEME).toBe('agentAccessToken');
});
