// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

const token = (subject: string, attributes: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  subject,
  attributes: {
    owner: 'acme',
    email: `${subject}@acme.test`,
    email_verified: true,
    displayName: subject,
    ...attributes,
  },
});

describe('employee-number identity binding (F-02 / SEC-02)', () => {
  let harness: IdentityHarness;

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });
  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'externalIdentities',
      'identityProviders',
      'identityAuditEvents',
      'account',
      'session',
      'user',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
  });

  it('binds an existing employee when employeeNo uniquely matches username', async () => {
    await registerProvider(harness);
    const localUserId = await harness.createLocalUser(
      'staff@acme.test',
      'Staff',
      '10001',
    );
    const result = await harness.services.provisioning.onLogin(
      token('casdoor-10001', {
        email: 'other@acme.test',
        employeeNo: '10001',
      }),
    );
    expect(result).toMatchObject({ created: false, localUserId });
    const row = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .selectAll()
      .where('providerSubject', '=', 'casdoor-10001')
      .executeTakeFirst();
    expect(row?.localUserId).toBe(localUserId);
    expect(await harness.users.get(localUserId)).toMatchObject({
      email: 'staff@acme.test',
    });
  });

  it('does not auto-merge by e-mail when employeeNo is absent', async () => {
    await registerProvider(harness);
    await harness.createLocalUser('dave@acme.test', 'Dave', 'dave');
    await expect(
      harness.services.provisioning.onLogin(token('dave')),
    ).rejects.toMatchObject({ reason: 'IDENTITY_EMAIL_CONFLICT' });
  });

  it('refuses a disabled employee even with a unique employeeNo', async () => {
    await registerProvider(harness);
    const localUserId = await harness.createLocalUser(
      'gone@acme.test',
      'Gone',
      '10002',
    );
    await harness.users.disable(localUserId);
    await expect(
      harness.services.provisioning.onLogin(
        token('casdoor-10002', { employeeNo: '10002' }),
      ),
    ).rejects.toMatchObject({ reason: 'ACCOUNT_DISABLED' });
  });

  it('previews and commits a unique employee-number batch, and refuses conflicts atomically', async () => {
    const alice = await harness.createLocalUser(
      'alice@acme.test',
      'Alice',
      '10001',
    );
    await harness.createLocalUser('bob@acme.test', 'Bob', '10002');
    const preview = await harness.services.externalIdentities.preview([
      {
        issuer: ISSUER,
        subject: 'sub-alice',
        employeeNo: '10001',
      },
      {
        issuer: ISSUER,
        subject: 'sub-missing',
        employeeNo: '99999',
      },
      {
        issuer: ISSUER,
        subject: 'sub-email',
        employeeNo: undefined,
      },
    ]);
    expect(preview.summary).toMatchObject({
      create: 1,
      conflict: 2,
    });
    expect(preview.rows[0]).toMatchObject({
      status: 'create',
      localUserId: alice,
    });
    expect(preview.rows[1]?.conflicts).toContain('EMPLOYEE_NO_NOT_FOUND');
    expect(preview.rows[2]?.conflicts).toContain('EMPLOYEE_NO_REQUIRED');

    await expect(
      harness.services.externalIdentities.commit(
        [
          {
            issuer: ISSUER,
            subject: 'sub-alice',
            employeeNo: '10001',
          },
          {
            issuer: ISSUER,
            subject: 'sub-missing',
            employeeNo: '99999',
          },
        ],
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'IDENTITY_BINDING_CONFLICTS' });
    expect(
      (
        await harness.database
          .connection()
          .query.selectFrom('externalIdentities')
          .select('id')
          .execute()
      ).length,
    ).toBe(0);

    const committed = await harness.services.externalIdentities.commit(
      [
        {
          issuer: ISSUER,
          subject: 'sub-alice',
          employeeNo: '10001',
        },
      ],
      'admin-1',
    );
    expect(committed.summary.create).toBe(1);
    const listed = await harness.services.externalIdentities.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      subject: 'sub-alice',
      localUserId: alice,
      username: '10001',
    });
  });

  it('classifies subject-already-bound and local-user-already-bound conflicts', async () => {
    const alice = await harness.createLocalUser(
      'alice@acme.test',
      'Alice',
      '10001',
    );
    await harness.createLocalUser('carol@acme.test', 'Carol', '10003');
    await harness.services.externalIdentities.commit(
      [{ issuer: ISSUER, subject: 'sub-alice', employeeNo: '10001' }],
      'admin-1',
    );
    const preview = await harness.services.externalIdentities.preview([
      { issuer: ISSUER, subject: 'sub-alice', employeeNo: '10001' },
      { issuer: ISSUER, subject: 'sub-other', employeeNo: '10001' },
    ]);
    expect(preview.rows[0]?.status).toBe('unchanged');
    expect(preview.rows[1]?.conflicts).toContain('LOCAL_USER_ALREADY_BOUND');
    expect(alice).toBeTruthy();
  });
});
