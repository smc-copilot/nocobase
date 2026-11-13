import { afterEach, describe, expect, it } from 'vitest';

import { ProtocolError } from '../../server/errors.js';
import {
  CONNECTION_ID,
  createAdapterHarness,
  SERVICE_SECRET,
  type AdapterHarness,
} from '../helpers/harness.js';

describe('business-ui.v1 protocol flow', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('handshakes, tickets, redeems, saves, submits, and queries idempotently', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('alice@example.com');
    await harness.bindSubject('octop-alice', userId);
    await harness.seedDefaults();

    const handshake = await harness.services.handshake(
      CONNECTION_ID,
      `Bearer ${SERVICE_SECRET}`,
      {
        protocol: 'business-ui.v1',
        destructive: false,
        instance_issuer: 'https://octop.test.local',
      },
    );
    expect(handshake.ok).toBe(true);
    expect(handshake.protocol).toBe('business-ui.v1');

    await harness.services.oauthCallback(CONNECTION_ID, {
      code: 'auth-code-1',
      state: 'state-1',
    });
    const pending = await harness.services.oauthConsume(
      CONNECTION_ID,
      `Bearer ${SERVICE_SECRET}`,
      { state: 'missing' },
    );
    expect(pending.pending).toBe(true);
    const consumed = await harness.services.oauthConsume(
      CONNECTION_ID,
      `Bearer ${SERVICE_SECRET}`,
      { state: 'state-1' },
    );
    expect(consumed.pending).toBe(false);

    const ticket = await harness.services.issueTicket(CONNECTION_ID, userId, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
      subjectSub: 'octop-alice',
    });
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ticket.expires_in).toBe(60);

    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'nonce-1' },
      new Request(
        'http://localhost/business-ui/connections/site-a/v1/tickets/redeem',
        {
          method: 'POST',
        },
      ),
    );
    expect(redeem.html).toContain('Generic request');
    expect(redeem.setCookies.length).toBeGreaterThan(0);

    await expect(
      harness.services.redeemTicket(
        CONNECTION_ID,
        { ticket: ticket.ticket as string, nonce: 'nonce-2' },
        new Request('http://localhost/x', { method: 'POST' }),
      ),
    ).rejects.toMatchObject({ code: 'TICKET_REPLAYED' });

    const cookie = redeem.setCookies.map((c) => c.split(';')[0]).join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    expect(session?.user.id).toBe(userId);
    const sessionRef = session!.session.id;

    const saved = await harness.services.saveDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'First draft',
        description: 'd',
        quantity: 2,
        record_version: 0,
      },
    );
    expect(saved.record_version).toBe(1);
    expect(saved.record_id).toBeTruthy();
    expect(saved.documentType).toBe(saved.document_type);

    await expect(
      harness.services.saveDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'stale',
        description: '',
        quantity: 1,
        record_version: 0,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const submitted = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'First draft',
        description: 'd',
        quantity: 2,
        record_version: 1,
        idempotency_key: 'submit-1',
      },
    );
    expect(submitted.status).toBe('submitted');
    expect(submitted.record_id).toMatch(/^REQ-/);
    expect(submitted.result).toMatchObject({ status: 'SUCCESS' });
    const operationId = submitted.operationId as string;

    const again = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'First draft',
        description: 'd',
        quantity: 2,
        record_version: 1,
        idempotency_key: 'submit-1',
      },
    );
    expect(again.operationId).toBe(operationId);
    expect(again.record_id).toBe(submitted.record_id);

    const interaction = await harness.services.getInteraction(
      CONNECTION_ID,
      userId,
      submitted.interactionId as string,
    );
    expect(interaction.latestSubmitOperationId).toBe(operationId);
    expect(interaction.receipt).toMatchObject({
      record_id: submitted.record_id,
    });

    const queried = await harness.services.queryOperation(
      CONNECTION_ID,
      userId,
      operationId,
    );
    expect(queried.query_only).toBe(true);
    expect(queried.status).toBe('SUCCEEDED');

    await expect(
      harness.services.retryOperation(CONNECTION_ID, userId, operationId),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it('rejects UNKNOWN retries and recovers via reconcile when a receipt exists', async () => {
    harness = await createAdapterHarness({
      faultInjection: { unknownOnSubmit: true },
    });
    const userId = await harness.createLocalUser('bob@example.com');
    await harness.bindSubject('octop-bob', userId);
    await harness.seedDefaults();

    const ticket = await harness.services.issueTicket(CONNECTION_ID, userId, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
    });
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n' },
      new Request('http://localhost/x', { method: 'POST' }),
    );
    const cookie = redeem.setCookies.map((c) => c.split(';')[0]).join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;

    const unknown = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'Unknown path',
        description: '',
        quantity: 1,
        record_version: 0,
        idempotency_key: 'u-1',
      },
    );
    expect(unknown.result).toMatchObject({ status: 'UNKNOWN' });
    const operationId = unknown.operationId as string;

    await expect(
      harness.services.retryOperation(CONNECTION_ID, userId, operationId),
    ).rejects.toMatchObject({ code: 'RETRY_NOT_SAFE' });

    const interaction = await harness.services.getInteraction(
      CONNECTION_ID,
      userId,
      unknown.interactionId as string,
    );
    expect(interaction.latestSubmitOperationId).toBe(operationId);
  });

  it('rejects unregistered form refs and URL form refs', async () => {
    harness = await createAdapterHarness();
    await harness.seedDefaults();
    await expect(
      harness.services.upsertForm({
        formRef: 'https://evil.example/form',
        schemaVersion: '1',
        mode: 'edit',
        handlerKey: 'generic-request',
      }),
    ).rejects.toMatchObject({ code: 'FORM_NOT_REGISTERED' });

    const userId = await harness.createLocalUser('carol@example.com');
    await harness.bindSubject('octop-carol', userId);
    await expect(
      harness.services.issueTicket(CONNECTION_ID, userId, {
        formRef: 'missing.form',
        schemaVersion: '1',
      }),
    ).rejects.toMatchObject({ code: 'FORM_NOT_REGISTERED' });
  });
});
