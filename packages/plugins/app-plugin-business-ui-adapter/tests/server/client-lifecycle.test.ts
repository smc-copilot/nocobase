import { createHash, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

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

describe('client and user lifecycle on embed access', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('rejects embed writes after the client is disabled and does not revive the old token', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('disabled-client@example.com');
    const issued = await harness.authorizeAgent(userId);
    const clientB = await harness.agent.clients.create({
      name: 'Client B',
      redirectUris: [REDIRECT_URI],
      allowedScopes: ['business-ui:view'],
    });
    const grantB = await harness.agent.grants.createOrReuse({
      clientId: clientB.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const pending = pkce();
    const codeB = await harness.agent.oauth.createAuthorizationCode({
      clientId: clientB.clientId,
      localUserId: userId,
      grantId: grantB.id,
      redirectUri: REDIRECT_URI,
      codeChallenge: pending.challenge,
      scope: 'business-ui:view',
    });
    const tokensB = await harness.agent.oauth.exchangeAuthorizationCode({
      clientId: clientB.clientId,
      code: codeB,
      redirectUri: REDIRECT_URI,
      codeVerifier: pending.verifier,
    });
    await harness.seedDefaults();
    const ticket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-life' },
        nonce: 'n-life',
      },
      issued.grant,
    );
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-life' },
      new Request('http://localhost/redeem', { method: 'POST' }),
    );
    const cookie = redeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;
    const staleTicket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-life' },
        nonce: 'n-life-stale',
      },
      issued.grant,
    );

    await harness.agent.clients.update(issued.grant.clientId, {
      enabled: false,
    });
    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Blocked',
        description: '',
        quantity: 1,
        record_version: 0,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    const docs = await harness.database
      .connection()
      .query.selectFrom('integrationTestDocuments')
      .select('id')
      .where('interactionId', '=', ticket.interaction_id as string)
      .execute();
    expect(docs).toHaveLength(0);
    expect(
      await harness.agent.oauth.resolveAccessToken(tokensB.access_token),
    ).toMatchObject({ clientId: clientB.clientId, userId });

    const local = await harness.auth.signInUser(
      userId,
      new Request('http://localhost/login', { method: 'POST' }),
    );
    expect(local.ok).toBe(true);

    await harness.agent.clients.update(issued.grant.clientId, {
      enabled: true,
    });
    expect(
      await harness.agent.oauth.resolveAccessToken(issued.accessToken),
    ).toBeUndefined();
    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Still blocked after re-enable',
        description: '',
        quantity: 1,
        record_version: 0,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    await expect(
      harness.services.redeemTicket(
        CONNECTION_ID,
        { ticket: staleTicket.ticket as string, nonce: 'n-life-stale' },
        new Request('http://localhost/redeem-stale', { method: 'POST' }),
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });
    expect(
      await harness.agent.oauth.resolveAccessToken(tokensB.access_token),
    ).toMatchObject({ clientId: clientB.clientId, userId });
    const renewed = await harness.authorizeAgent(userId);
    expect(renewed.accessToken).not.toBe(issued.accessToken);
    const next = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-life' },
        nonce: 'n-life-2',
      },
      renewed.grant,
    );
    expect(next.ticket).toBeTruthy();
    const renewedRedeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: next.ticket as string, nonce: 'n-life-2' },
      new Request('http://localhost/redeem-new', { method: 'POST' }),
    );
    const renewedCookie = renewedRedeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const renewedSession = await harness.auth.getSession(
      new Headers({ cookie: renewedCookie }),
      { disableRefresh: true },
    );
    const saved = await harness.services.saveDocument(
      CONNECTION_ID,
      userId,
      renewedSession!.session.id,
      {
        title: 'After re-enable',
        description: '',
        quantity: 1,
        record_version: 0,
      },
    );
    expect(saved.record_version).toBe(1);
  });

  it('does not revive an old embed after the user is re-enabled', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('disabled-user@example.com');
    const issued = await harness.authorizeAgent(userId);
    await harness.seedDefaults();
    const ticket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-user' },
        nonce: 'n-user',
      },
      issued.grant,
    );
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-user' },
      new Request('http://localhost/redeem', { method: 'POST' }),
    );
    const cookie = redeem.setCookies
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;

    await harness.users.disable(userId);
    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Blocked while disabled',
        description: '',
        quantity: 1,
        record_version: 0,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    await harness.users.enable(userId);
    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Blocked after enable',
        description: '',
        quantity: 1,
        record_version: 0,
      }),
    ).rejects.toMatchObject({ code: 'GRANT_REQUIRED' });

    const renewed = await harness.authorizeAgent(userId);
    const next = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-user-2' },
        nonce: 'n-user-2',
      },
      renewed.grant,
    );
    expect(next.ticket).toBeTruthy();
  });
});
