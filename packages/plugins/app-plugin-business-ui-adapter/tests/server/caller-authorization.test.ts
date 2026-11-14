import { createHash, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { hashTicket } from '../../server/crypto.js';
import type { GrantContext } from '../../server/grants.js';
import {
  AUDIENCE,
  CONNECTION_ID,
  createAdapterHarness,
  REDIRECT_URI,
  type AdapterHarness,
} from '../helpers/harness.js';

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function operationRow(harness: AdapterHarness, operationId: string) {
  return harness.database
    .connection()
    .query.selectFrom('businessUiOperations')
    .select(['status', 'attemptCount', 'resultType'])
    .where('operationId', '=', operationId)
    .executeTakeFirstOrThrow();
}

async function documents(harness: AdapterHarness, interactionId: string) {
  return harness.database
    .connection()
    .query.selectFrom('integrationTestDocuments')
    .select(['id', 'title', 'version', 'status'])
    .where('interactionId', '=', interactionId)
    .execute();
}

describe('caller credential and scope intersection', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  async function failedEdit(userId: string) {
    const issued = await harness.authorizeAgent(userId);
    const ticket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-user' },
        nonce: `n-${userId}`,
      },
      issued.grant,
    );
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: `n-${userId}` },
      new Request('http://localhost/redeem', { method: 'POST' }),
    );
    const cookie = redeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const failed = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      session!.session.id,
      {
        title: 'Before refuse',
        description: '',
        quantity: 1,
        record_version: 0,
        idempotency_key: `fail-${userId}`,
      },
    );
    return {
      issued,
      ticket,
      sessionRef: session!.session.id,
      operationId: failed.operationId as string,
      interactionId: failed.interactionId as string,
    };
  }

  it('refuses another client, another grant, and another user without writing', async () => {
    harness = await createAdapterHarness({
      faultInjection: { failBeforeWrite: true },
    });
    const ownerId = await harness.createLocalUser('owner@example.com');
    const otherId = await harness.createLocalUser('other@example.com');
    await harness.seedDefaults();
    const owner = await failedEdit(ownerId);
    const before = await operationRow(harness, owner.operationId);
    const beforeDocs = await documents(harness, owner.interactionId);

    const clientB = await harness.agent.clients.create({
      name: 'Client B',
      redirectUris: [REDIRECT_URI],
      allowedScopes: ['business-ui:view'],
    });
    const grantBRow = await harness.agent.grants.createOrReuse({
      clientId: clientB.clientId,
      localUserId: ownerId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const { verifier, challenge } = pkce();
    const code = await harness.agent.oauth.createAuthorizationCode({
      clientId: clientB.clientId,
      localUserId: ownerId,
      grantId: grantBRow.id,
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      scope: 'business-ui:view',
    });
    await harness.agent.oauth.exchangeAuthorizationCode({
      clientId: clientB.clientId,
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
    });
    const grantB: GrantContext = {
      grantId: grantBRow.id,
      clientId: grantBRow.clientId,
      localUserId: ownerId,
      audience: AUDIENCE,
      scopes: grantBRow.scopes,
      tokenScopes: ['business-ui:view'],
      revision: grantBRow.revision,
    };
    const callerB = { kind: 'agent' as const, grant: grantB };

    await expect(
      harness.services.getInteraction(
        CONNECTION_ID,
        ownerId,
        owner.interactionId,
        callerB,
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    await expect(
      harness.services.queryOperation(
        CONNECTION_ID,
        ownerId,
        owner.operationId,
        callerB,
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    await expect(
      harness.services.retryOperation(
        CONNECTION_ID,
        ownerId,
        owner.operationId,
        callerB,
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    await harness.services.upsertConnection({
      connectionId: 'site-b',
      octopIssuer: 'https://octop.test.local',
      allowedOrigins: ['https://octop.test.local'],
      serviceSecret: 'other-secret',
      clientId: clientB.clientId,
      enabled: true,
    });
    await expect(
      harness.services.getInteraction(
        'site-b',
        ownerId,
        owner.interactionId,
        callerB,
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });

    const other = await harness.authorizeAgent(otherId);
    await expect(
      harness.services.getInteraction(
        CONNECTION_ID,
        otherId,
        owner.interactionId,
        { kind: 'agent', grant: other.grant },
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });

    const createdAt = new Date();
    const otherGrantId = 'grant_same_client_other';
    await harness.database
      .connection()
      .query.insertInto('agentGrants')
      .values({
        id: otherGrantId,
        clientId: owner.issued.grant.clientId,
        localUserId: ownerId,
        audience: AUDIENCE,
        scopes: ['business-ui:view', 'business-ui:edit'],
        revision: 1,
        status: 'active',
        expiresAt: null,
        lastUsedAt: createdAt,
        revokedAt: null,
        createdAt,
        updatedAt: createdAt,
      })
      .execute();
    const sameClient: GrantContext = {
      grantId: otherGrantId,
      clientId: owner.issued.grant.clientId,
      localUserId: ownerId,
      audience: AUDIENCE,
      scopes: ['business-ui:view', 'business-ui:edit'],
      tokenScopes: ['business-ui:edit'],
      revision: 1,
    };
    await expect(
      harness.services.retryOperation(
        CONNECTION_ID,
        ownerId,
        owner.operationId,
        {
          kind: 'agent',
          grant: sameClient,
        },
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    expect(await operationRow(harness, owner.operationId)).toEqual(before);
    expect(await documents(harness, owner.interactionId)).toEqual(beforeDocs);
  });

  it('keeps a view token from issuing an edit ticket or retrying', async () => {
    harness = await createAdapterHarness({
      faultInjection: { failBeforeWrite: true },
    });
    const userId = await harness.createLocalUser('view@example.com');
    await harness.seedDefaults();
    const owner = await failedEdit(userId);
    const before = await operationRow(harness, owner.operationId);
    const narrow = await harness.authorizeAgent(userId, {
      scopes: ['business-ui:view'],
    });
    expect(narrow.grant.grantId).toBe(owner.issued.grant.grantId);
    expect(narrow.grant.tokenScopes).toEqual(['business-ui:view']);

    await expect(
      harness.services.issueTicket(
        CONNECTION_ID,
        userId,
        {
          formRef: 'generic.request.edit',
          schemaVersion: '1',
          subject: { issuer: 'https://octop.test.local', sub: 'octop-view' },
          nonce: 'n-view-edit',
        },
        narrow.grant,
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    await expect(
      harness.services.retryOperation(
        CONNECTION_ID,
        userId,
        owner.operationId,
        { kind: 'agent', grant: narrow.grant },
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    expect(await operationRow(harness, owner.operationId)).toEqual(before);

    const refreshed = await harness.agent.oauth.refresh({
      clientId: narrow.grant.clientId,
      refreshToken: narrow.refreshToken,
      scope: 'business-ui:view',
    });
    expect(refreshed.scope).toBe('business-ui:view');
    await expect(
      harness.services.issueTicket(
        CONNECTION_ID,
        userId,
        {
          formRef: 'generic.request.edit',
          schemaVersion: '1',
          subject: { issuer: 'https://octop.test.local', sub: 'octop-view' },
          nonce: 'n-refresh-view',
        },
        { ...owner.issued.grant, tokenScopes: ['business-ui:view'] },
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
  });

  it('refuses embeds and tickets that lack a scope snapshot', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('legacy@example.com');
    const issued = await harness.authorizeAgent(userId);
    await harness.seedDefaults();
    const ticket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-legacy' },
        nonce: 'n-legacy',
      },
      issued.grant,
    );
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-legacy' },
      new Request('http://localhost/redeem', { method: 'POST' }),
    );
    const cookie = redeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;
    const saved = await harness.services.saveDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'Kept draft',
        description: '',
        quantity: 2,
        record_version: 0,
      },
    );
    expect(saved.record_version).toBe(1);
    await harness.database
      .connection()
      .query.updateTable('businessUiEmbedContexts')
      .set({ scopes: null })
      .where('authSessionRef', '=', sessionRef)
      .execute();

    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Should not land',
        description: '',
        quantity: 9,
        record_version: 1,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    await harness.database
      .connection()
      .query.updateTable('businessUiEmbedContexts')
      .set({ scopes: { not: 'an-array' } })
      .where('authSessionRef', '=', sessionRef)
      .execute();
    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Still blocked',
        description: '',
        quantity: 3,
        record_version: 1,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    const freshTicket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-legacy-2' },
        nonce: 'n-legacy-2',
      },
      issued.grant,
    );
    await harness.database
      .connection()
      .query.updateTable('businessUiTickets')
      .set({
        context: {
          recordId: null,
          documentType: 'generic.request',
          mode: 'edit',
          permissionRef: 'generic.request:edit',
          formConfigVersion: '1',
        },
      })
      .where('ticketDigest', '=', hashTicket(freshTicket.ticket as string))
      .execute();
    await expect(
      harness.services.redeemTicket(
        CONNECTION_ID,
        { ticket: freshTicket.ticket as string, nonce: 'n-legacy-2' },
        new Request('http://localhost/redeem', { method: 'POST' }),
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    const interactionId = ticket.interaction_id as string;
    expect(await documents(harness, interactionId)).toEqual([
      expect.objectContaining({
        title: 'Kept draft',
        version: 1,
        status: 'draft',
      }),
    ]);

    const recoveredTicket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        interactionId,
        subject: { issuer: 'https://octop.test.local', sub: 'octop-legacy' },
        nonce: 'n-legacy-recovered',
      },
      issued.grant,
    );
    const recovered = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: recoveredTicket.ticket as string, nonce: 'n-legacy-recovered' },
      new Request('http://localhost/redeem-again', { method: 'POST' }),
    );
    const recoveredCookie = recovered.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const recoveredSession = await harness.auth.getSession(
      new Headers({ cookie: recoveredCookie }),
      { disableRefresh: true },
    );
    const next = await harness.services.saveDocument(
      CONNECTION_ID,
      userId,
      recoveredSession!.session.id,
      {
        title: 'Kept draft',
        description: 'resumed',
        quantity: 2,
        record_version: 1,
      },
    );
    expect(next.record_version).toBe(2);
    expect(await documents(harness, interactionId)).toEqual([
      expect.objectContaining({
        title: 'Kept draft',
        version: 2,
        status: 'draft',
      }),
    ]);
  });

  it('rejects a later save when the client allowed scopes shrink', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('shrink@example.com');
    const issued = await harness.authorizeAgent(userId);
    await harness.seedDefaults();
    const ticket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-shrink' },
        nonce: 'n-shrink',
      },
      issued.grant,
    );
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-shrink' },
      new Request('http://localhost/redeem-shrink', { method: 'POST' }),
    );
    const cookie = redeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const saved = await harness.services.saveDocument(
      CONNECTION_ID,
      userId,
      session!.session.id,
      {
        title: 'Before shrink',
        description: '',
        quantity: 1,
        record_version: 0,
      },
    );
    expect(saved.record_version).toBe(1);
    await harness.agent.clients.update(issued.grant.clientId, {
      allowedScopes: ['business-ui:view'],
    });
    await expect(
      harness.services.saveDocument(
        CONNECTION_ID,
        userId,
        session!.session.id,
        {
          title: 'After shrink',
          description: '',
          quantity: 4,
          record_version: 1,
        },
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    expect(await documents(harness, ticket.interaction_id as string)).toEqual([
      expect.objectContaining({
        title: 'Before shrink',
        version: 1,
        status: 'draft',
      }),
    ]);
  });

  it('retries through the caller session and leaves state unchanged for another session', async () => {
    harness = await createAdapterHarness({
      faultInjection: { failBeforeWrite: true },
    });
    const userId = await harness.createLocalUser('session@example.com');
    await harness.seedDefaults();
    const owner = await failedEdit(userId);
    const before = await operationRow(harness, owner.operationId);
    harness.config.current = {};

    await expect(
      harness.services.retryOperation(
        CONNECTION_ID,
        userId,
        owner.operationId,
        {
          kind: 'embed',
          sessionRef: 'some-other-browser-session',
        },
      ),
    ).rejects.toMatchObject({ code: 'EMBED_CONTEXT_REQUIRED' });
    expect(await operationRow(harness, owner.operationId)).toEqual(before);

    const recovered = await harness.services.retryOperation(
      CONNECTION_ID,
      userId,
      owner.operationId,
      { kind: 'embed', sessionRef: owner.sessionRef },
    );
    expect(recovered.status).toBe('submitted');
    expect(recovered.operationId).toBe(owner.operationId);
  });
});
