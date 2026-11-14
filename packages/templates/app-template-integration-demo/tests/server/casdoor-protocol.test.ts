// @vitest-environment node
/**
 * Gate A N01–N06: real-template HTTP regression for Casdoor resource tokens on
 * business-ui.v1 protocol routes, with native Authorization checks.
 */
import { randomUUID } from 'node:crypto';

import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  CASDOOR_ACCESS_TOKEN_HEADER,
  CASDOOR_ACCESS_TOKEN_SCHEME,
} from '@nocobase/app-plugin-casdoor-identity/server';
import { casdoorIdentityAdminToken } from '@nocobase/app-plugin-casdoor-identity/server/tokens';
import { businessUiAdapterServiceToken } from '@nocobase/app-plugin-business-ui-adapter/server/tokens';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const CASDOOR_ISSUER = 'https://casdoor.integration-demo.test';
const OCTOP_ISSUER = 'https://octop.integration-demo.test';
const AUDIENCE = 'nocobase-integration-demo';
const CONNECTION_ID = 'demo-site';
const SERVICE_SECRET = 'demo-connection-service-secret';
const PERMISSION_EDIT = 'generic.request:edit';
const FORM_EDIT = 'generic.request.edit';
const SUBJECT = 'casdoor-subject-alice';
const OCTOP_SUBJECT = 'octop-subject-alice';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk: JWK = await exportJWK(publicKey);
jwk.kid = 'integration-demo-casdoor';
jwk.alg = 'RS256';
jwk.use = 'sig';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    casdoorIdentity: {
      issuer: CASDOOR_ISSUER,
      audience: AUDIENCE,
      jwks: { keys: [jwk as Record<string, unknown>] },
      mappablePermissionSets: ['business-editor'],
    },
  },
});

async function signToken(
  key: KeyLike,
  claims: {
    readonly subject?: string;
    readonly audience?: string | string[];
    readonly owner?: string;
    readonly exp?: string | number;
  } = {},
): Promise<string> {
  return new SignJWT({
    owner: claims.owner ?? 'acme',
    email: `${claims.subject ?? SUBJECT}@acme.test`,
    email_verified: true,
    displayName: claims.subject ?? SUBJECT,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'integration-demo-casdoor' })
    .setIssuer(CASDOOR_ISSUER)
    .setAudience(claims.audience ?? AUDIENCE)
    .setSubject(claims.subject ?? SUBJECT)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5m')
    .sign(key);
}

function protocolUrl(publicBasePath: string, suffix: string): string {
  const base = publicBasePath.replace(/\/$/, '');
  return `http://localhost${base}/business-ui/connections/${CONNECTION_ID}/v1${suffix}`;
}

test('N01–N06 Casdoor resource token on business-ui protocol HTTP', async ({
  testApp,
  app,
  request,
}) => {
  const services = app.container.resolve(businessUiAdapterServiceToken);
  const identity = app.container.resolve(casdoorIdentityAdminToken);
  const authz = app.container.resolve(authorizationToken);

  await identity.providers.upsert(
    {
      providerId: 'casdoor',
      issuer: CASDOOR_ISSUER,
      admissionPolicy: { allowOrganizations: ['acme'] },
      secretRef: 'env:CASDOOR_SECRET',
    },
    null,
  );

  await authz.permissionSets.create({
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: '*' },
        actions: [{ action: 'edit' }, { action: 'view' }],
      },
    ],
  });

  await services.upsertConnection({
    connectionId: CONNECTION_ID,
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

  // First JWT login provisions the local user + externalIdentities row.
  const token = await signToken(privateKey);
  const me = await request('/casdoorIdentity/me', {
    headers: { [CASDOOR_ACCESS_TOKEN_HEADER]: token },
  });
  expect(me.status).toBe(200);
  const { data: meData } = (await me.json()) as { data: { userId: string } };
  const userId = meData.userId;

  await authz.permissionSets.assign({
    id: `user:${userId}:business-editor`,
    permissionSet: 'business-editor',
    subject: { type: 'user', id: userId },
  });

  const externalRow = await testApp.connection.query
    .selectFrom('externalIdentities')
    .selectAll()
    .where('providerIssuer', '=', CASDOOR_ISSUER)
    .where('providerSubject', '=', SUBJECT)
    .executeTakeFirstOrThrow();

  await identity.bindings.commit(
    [
      {
        connectionId: CONNECTION_ID,
        octopSubject: OCTOP_SUBJECT,
        externalIdentityId: String(externalRow.id),
        localUserId: userId,
      },
    ],
    userId,
  );

  const ticketBody = {
    formRef: FORM_EDIT,
    schemaVersion: '1',
    subject: { issuer: OCTOP_ISSUER, sub: OCTOP_SUBJECT },
    nonce: randomUUID(),
  };

  // N01: declared /tickets admits casdoorAccessToken and issues a ticket.
  const ticketsUrl = protocolUrl(testApp.publicBasePath, '/tickets');
  const n01 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: token,
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
  expect(ticketJson.interactionId).toBeTruthy();

  // N02: undeclared route refuses the Casdoor credential (PERMISSION_DENIED / 403).
  const n02 = await request('/users', {
    headers: { [CASDOOR_ACCESS_TOKEN_HEADER]: token },
  });
  expect(n02.status).toBe(403);
  const n02Body = (await n02.json()) as { error?: { reason?: string } };
  expect(n02Body.error?.reason).toBe('CREDENTIAL_NOT_ACCEPTED');

  // Session-only document route must not accept the resource token either.
  const saveUrl = protocolUrl(testApp.publicBasePath, '/documents/save');
  const saveDenied = await testApp.fetch(
    new Request(saveUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: token,
      },
      body: JSON.stringify({}),
    }),
  );
  expect([401, 403]).toContain(saveDenied.status);

  // N03: user without the Permission Set is denied.
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
  const n03 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: JSON.stringify({ ...ticketBody, nonce: randomUUID() }),
    }),
  );
  expect(n03.status).toBe(403);
  const n03Body = (await n03.json()) as { error?: { code?: string } };
  expect(n03Body.error?.code).toBe('PERMISSION_DENIED');

  // N04: re-grant → allow; wrong record id (scoped deny) → deny.
  await authz.permissionSets.assign({
    id: `user:${userId}:business-editor`,
    permissionSet: 'business-editor',
    subject: { type: 'user', id: userId },
  });
  const n04Allow = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
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
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
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
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
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

  // Restore wildcard edit for query/retry scope recovery.
  await authz.permissionSets.update('business-editor', {
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: '*' },
        actions: [{ action: 'edit' }, { action: 'view' }],
      },
    ],
  });

  // N05: query/retry recover real form scope (not hard-coded generic.request:edit).
  const queryUrl = protocolUrl(
    testApp.publicBasePath,
    `/operations/${n04Ticket.operationId}`,
  );
  const retryUrl = protocolUrl(
    testApp.publicBasePath,
    `/operations/${n04Ticket.operationId}/retry`,
  );
  const n05 = await testApp.fetch(
    new Request(queryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: '{}',
    }),
  );
  expect(n05.status).toBe(200);
  const n05Body = (await n05.json()) as { operationId?: string };
  expect(n05Body.operationId).toBe(n04Ticket.operationId);

  // Without the recovered form permission, query fails — an unrelated edit grant is not enough.
  await authz.permissionSets.update('business-editor', {
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'other.resource', id: '*' },
        actions: [{ action: 'edit' }],
      },
    ],
  });
  const n05Denied = await testApp.fetch(
    new Request(queryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: '{}',
    }),
  );
  expect(n05Denied.status).toBe(403);
  const n05RetryDenied = await testApp.fetch(
    new Request(retryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: '{}',
    }),
  );
  expect(n05RetryDenied.status).toBe(403);

  await authz.permissionSets.update('business-editor', {
    key: 'business-editor',
    grants: [
      {
        resource: { type: 'generic.request', id: '*' },
        actions: [{ action: 'edit' }, { action: 'view' }],
      },
    ],
  });
  const n05Restored = await testApp.fetch(
    new Request(queryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: '{}',
    }),
  );
  expect(n05Restored.status).toBe(200);

  // N06: revoke Permission Set → next ticket denied.
  const assignment = (await authz.permissionSets.listAssignments()).find(
    (entry) =>
      entry.subject.type === 'user' &&
      entry.subject.id === userId &&
      (entry.permissionSet === 'business-editor' ||
        (entry as { key?: string }).key === 'business-editor'),
  );
  expect(assignment).toBeTruthy();
  await authz.permissionSets.revoke(assignment!.id);
  const n06 = await testApp.fetch(
    new Request(ticketsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CASDOOR_ACCESS_TOKEN_HEADER]: await signToken(privateKey),
      },
      body: JSON.stringify({ ...ticketBody, nonce: randomUUID() }),
    }),
  );
  expect(n06.status).toBe(403);
  expect(CASDOOR_ACCESS_TOKEN_SCHEME).toBe('casdoorAccessToken');
});
