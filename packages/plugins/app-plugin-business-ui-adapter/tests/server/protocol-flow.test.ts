import { afterEach, describe, expect, it } from 'vitest';

import { ProtocolError } from '../../server/errors.js';
import {
  CONNECTION_ID,
  createAdapterHarness,
  PERMISSION_EDIT,
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
    expect(handshake.ticket_path).toBe('/v1/tickets');
    expect(handshake.redeem_path).toBe('/v1/tickets/redeem');
    expect(handshake.paths).toBeUndefined();
    expect(
      (handshake.features as { user_auth_methods?: string[] })
        .user_auth_methods,
    ).toEqual(['oauth2']);

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
    expect(consumed.code).toBe('auth-code-1');
    expect(consumed.code_digest).toBeUndefined();

    const ticket = await harness.services.issueTicket(CONNECTION_ID, userId, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
      subject: {
        issuer: 'https://octop.test.local',
        sub: 'octop-alice',
      },
      nonce: 'issue-nonce-1',
    });
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ticket.expires_in).toBe(60);
    expect(ticket.operation_id).toBeTruthy();
    const slotOperationId = ticket.operation_id as string;

    await expect(
      harness.services.redeemTicket(
        CONNECTION_ID,
        { ticket: ticket.ticket as string, nonce: 'wrong-nonce' },
        new Request('http://localhost/x', { method: 'POST' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'issue-nonce-1' },
      new Request(
        'http://localhost/business-ui/connections/site-a/v1/tickets/redeem',
        {
          method: 'POST',
        },
      ),
    );
    expect(redeem.html).toContain('Generic request');
    expect(redeem.html).toContain('id="save"');
    expect(redeem.setCookies.length).toBeGreaterThan(0);
    expect(redeem.frameAncestors).toContain('https://octop.test.local');

    await expect(
      harness.services.redeemTicket(
        CONNECTION_ID,
        { ticket: ticket.ticket as string, nonce: 'issue-nonce-1' },
        new Request('http://localhost/x', { method: 'POST' }),
      ),
    ).rejects.toMatchObject({ code: 'TICKET_REPLAYED' });

    const cookie = redeem.setCookies.map((c) => c.split(';')[0]).join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    expect(session?.user.id).toBe(userId);
    const sessionRef = session!.session.id;

    const beforeSubmit = await harness.services.getInteraction(
      CONNECTION_ID,
      userId,
      ticket.interaction_id as string,
    );
    expect(beforeSubmit.success).toBe(true);
    expect(beforeSubmit.status).toBe('draft');
    expect(beforeSubmit.record_id).toBeNull();
    expect(beforeSubmit.operation_id).toBe(slotOperationId);
    expect(beforeSubmit.result).toBeUndefined();

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
    expect(saved.status).toBe('draft');
    expect(saved.record_id).toBeNull();
    expect(saved.record_version).toBe(1);
    expect(saved.result).toBeUndefined();
    expect(saved.operation_id).toBe(slotOperationId);
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
    expect(submitted.operationId).toBe(slotOperationId);

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
    expect(again.operationId).toBe(slotOperationId);
    expect(again.record_id).toBe(submitted.record_id);

    await expect(
      harness.services.submitDocument(CONNECTION_ID, userId, sessionRef, {
        title: 'Different payload',
        description: 'd',
        quantity: 9,
        record_version: 1,
        idempotency_key: 'submit-1',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const interaction = await harness.services.getInteraction(
      CONNECTION_ID,
      userId,
      submitted.interactionId as string,
    );
    expect(interaction.success).toBe(true);
    expect(interaction.operation_id).toBe(slotOperationId);
    expect(interaction.record_id).toBe(submitted.record_id);
    expect(interaction.receipt).toBeUndefined();

    const queried = await harness.services.queryOperation(
      CONNECTION_ID,
      userId,
      slotOperationId,
    );
    expect(queried.query_only).toBe(true);
    expect(queried.success).toBe(true);
    expect(queried.status).toBe('submitted');
    expect(queried.receipt).toBeUndefined();

    await expect(
      harness.services.retryOperation(CONNECTION_ID, userId, slotOperationId),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it('rejects users without business permission (three-state auth)', async () => {
    harness = await createAdapterHarness();
    const allowed = await harness.createLocalUser('allowed@example.com');
    const denied = await harness.createLocalUser(
      'denied@example.com',
      undefined,
      {
        grantDefaults: false,
      },
    );
    await harness.bindSubject('octop-allowed', allowed);
    await harness.bindSubject('octop-denied', denied);
    await harness.seedDefaults();

    await expect(
      harness.services.issueTicket(CONNECTION_ID, denied, {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-denied' },
        nonce: 'n-denied',
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    const ticket = await harness.services.issueTicket(CONNECTION_ID, allowed, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
      subject: { issuer: 'https://octop.test.local', sub: 'octop-allowed' },
      nonce: 'n-allowed',
    });
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-allowed' },
      new Request('http://localhost/x', { method: 'POST' }),
    );
    const cookie = redeem.setCookies.map((c) => c.split(';')[0]).join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;

    await harness.services.saveDocument(CONNECTION_ID, allowed, sessionRef, {
      title: 'ok',
      description: '',
      quantity: 1,
      record_version: 0,
    });
    const submitted = await harness.services.submitDocument(
      CONNECTION_ID,
      allowed,
      sessionRef,
      {
        title: 'ok',
        description: '',
        quantity: 1,
        record_version: 1,
        idempotency_key: 'auth-submit',
      },
    );
    expect(submitted.record_id).toMatch(/^REQ-/);

    // Subsequent write on an already-submitted record is a disclosable business rejection.
    const rejected = await harness.services.saveDocument(
      CONNECTION_ID,
      allowed,
      sessionRef,
      {
        title: 'again',
        description: '',
        quantity: 1,
        record_version: Number(submitted.record_version),
      },
    );
    expect(rejected.result).toMatchObject({
      status: 'BUSINESS_REJECTED',
      code: 'ALREADY_SUBMITTED',
    });
    expect(rejected.record_id).toBe(submitted.record_id);

    harness.revokeAccess(allowed, [PERMISSION_EDIT]);
    await expect(
      harness.services.issueTicket(CONNECTION_ID, allowed, {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-allowed' },
        nonce: 'n-revoked',
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('rejects UNKNOWN retries and recovers via reconcile when a SUCCESS receipt exists', async () => {
    harness = await createAdapterHarness({
      faultInjection: { unknownOnSubmit: true },
    });
    const userId = await harness.createLocalUser('bob@example.com');
    await harness.bindSubject('octop-bob', userId);
    await harness.seedDefaults();

    const ticket = await harness.services.issueTicket(CONNECTION_ID, userId, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
      subject: { issuer: 'https://octop.test.local', sub: 'octop-bob' },
      nonce: 'n-unknown',
    });
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-unknown' },
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
    expect(unknown.result).toMatchObject({
      status: 'UNKNOWN',
      side_effect: null,
    });
    expect(unknown.record_id).toBeNull();
    const operationId = unknown.operationId as string;

    await expect(
      harness.services.retryOperation(CONNECTION_ID, userId, operationId),
    ).rejects.toMatchObject({ code: 'RETRY_NOT_SAFE' });

    const interaction = await harness.services.getInteraction(
      CONNECTION_ID,
      userId,
      unknown.interactionId as string,
    );
    expect(interaction.operation_id ?? interaction.operationId).toBe(
      operationId,
    );
  });

  it('safe-retries a FAILED operation that never wrote (failBeforeWrite)', async () => {
    harness = await createAdapterHarness({
      faultInjection: { failBeforeWrite: true },
    });
    const userId = await harness.createLocalUser('retry@example.com');
    await harness.bindSubject('octop-retry', userId);
    await harness.seedDefaults();

    const ticket = await harness.services.issueTicket(CONNECTION_ID, userId, {
      formRef: 'generic.request.edit',
      schemaVersion: '1',
      subject: { issuer: 'https://octop.test.local', sub: 'octop-retry' },
      nonce: 'n-retry',
    });
    const redeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: ticket.ticket as string, nonce: 'n-retry' },
      new Request('http://localhost/x', { method: 'POST' }),
    );
    const cookie = redeem.setCookies.map((c) => c.split(';')[0]).join('; ');
    const session = await harness.auth.getSession(new Headers({ cookie }), {
      disableRefresh: true,
    });
    const sessionRef = session!.session.id;

    const failed = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      sessionRef,
      {
        title: 'Will fail',
        description: '',
        quantity: 3,
        record_version: 0,
        idempotency_key: 'retry-1',
      },
    );
    expect(failed.result).toMatchObject({
      status: 'FAILED',
      safe_retry: true,
      side_effect: false,
    });
    const operationId = failed.operationId as string;

    // Clear the one-shot fault so the retry can complete.
    harness.config.current = {};
    const recovered = await harness.services.retryOperation(
      CONNECTION_ID,
      userId,
      operationId,
    );
    expect(recovered.status).toBe('submitted');
    expect(recovered.operationId).toBe(operationId);
    expect(recovered.record_id).toMatch(/^REQ-/);

    const docs = await harness.database
      .connection()
      .query.selectFrom('integrationTestDocuments')
      .selectAll()
      .where('interactionId', '=', failed.interactionId as string)
      .execute();
    expect(docs).toHaveLength(1);
  });

  it('detail redeem is read-only and rejects writes', async () => {
    harness = await createAdapterHarness();
    const userId = await harness.createLocalUser('detail@example.com');
    await harness.bindSubject('octop-detail', userId);
    await harness.seedDefaults();

    const editTicket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.edit',
        schemaVersion: '1',
        subject: { issuer: 'https://octop.test.local', sub: 'octop-detail' },
        nonce: 'n-edit',
      },
    );
    const editRedeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: editTicket.ticket as string, nonce: 'n-edit' },
      new Request('http://localhost/x', { method: 'POST' }),
    );
    const editCookie = editRedeem.setCookies
      .map((c) => c.split(';')[0])
      .join('; ');
    const editSession = await harness.auth.getSession(
      new Headers({ cookie: editCookie }),
      { disableRefresh: true },
    );
    const submitted = await harness.services.submitDocument(
      CONNECTION_ID,
      userId,
      editSession!.session.id,
      {
        title: 'Detail source',
        description: 'body',
        quantity: 4,
        record_version: 0,
        idempotency_key: 'detail-src',
      },
    );
    const recordId = submitted.record_id as string;

    const detailTicket = await harness.services.issueTicket(
      CONNECTION_ID,
      userId,
      {
        formRef: 'generic.request.detail',
        schemaVersion: '1',
        recordId,
        subject: { issuer: 'https://octop.test.local', sub: 'octop-detail' },
        nonce: 'n-detail',
      },
    );
    const detailRedeem = await harness.services.redeemTicket(
      CONNECTION_ID,
      { ticket: detailTicket.ticket as string, nonce: 'n-detail' },
      new Request('http://localhost/x', { method: 'POST' }),
    );
    expect(detailRedeem.html).toContain('(detail)');
    expect(detailRedeem.html).not.toContain('id="save"');
    expect(detailRedeem.html).toContain('Detail source');
    expect(detailRedeem.html).toContain('business-ui/hint');

    const detailCookie = detailRedeem.setCookies
      .map((c) => c.split(';')[0])
      .join('; ');
    const detailSession = await harness.auth.getSession(
      new Headers({ cookie: detailCookie }),
      { disableRefresh: true },
    );
    await expect(
      harness.services.saveDocument(
        CONNECTION_ID,
        userId,
        detailSession!.session.id,
        {
          title: 'hack',
          description: '',
          quantity: 1,
          record_version: 0,
        },
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(
      harness.services.submitDocument(
        CONNECTION_ID,
        userId,
        detailSession!.session.id,
        {
          title: 'hack',
          description: '',
          quantity: 1,
          record_version: 0,
          idempotency_key: 'hack',
        },
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
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
        subject: { issuer: 'https://octop.test.local', sub: 'octop-carol' },
        nonce: 'n-missing',
      }),
    ).rejects.toMatchObject({ code: 'FORM_NOT_REGISTERED' });
  });
});
