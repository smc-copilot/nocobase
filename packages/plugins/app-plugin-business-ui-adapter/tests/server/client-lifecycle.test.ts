import { afterEach, describe, expect, it } from 'vitest';

import {
  CONNECTION_ID,
  createAdapterHarness,
  type AdapterHarness,
} from '../helpers/harness.js';

describe('client and user lifecycle on embed access', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('rejects embed writes after the client is disabled and does not revive the old token', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('disabled-client@example.com');
    const issued = await harness.authorizeAgent(userId);
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
  });
});
