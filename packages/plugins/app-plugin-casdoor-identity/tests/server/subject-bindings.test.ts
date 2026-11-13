// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIdentityHarness,
  ISSUER,
  type IdentityHarness,
} from '../helpers/harness.js';

describe('Octop subject pre-binding (SEC-02, IAM subject binding)', () => {
  let harness: IdentityHarness;
  let alice: string;
  let bob: string;
  let aliceIdentity: string;
  let bobIdentity: string;

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });
  afterAll(async () => {
    await harness.close();
  });

  const bindingRows = async () =>
    harness.database
      .connection()
      .query.selectFrom('businessUiSubjectBindings')
      .selectAll()
      .execute();

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'businessUiSubjectBindings',
      'identityAuditEvents',
      'externalIdentities',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    await query.deleteFrom('account').allowAllRows().execute();
    await query.deleteFrom('user').allowAllRows().execute();
    alice = await harness.createLocalUser('alice@acme.test');
    bob = await harness.createLocalUser('bob@acme.test');
    aliceIdentity = await harness.bind('sub-alice', alice);
    bobIdentity = await harness.bind('sub-bob', bob);
  });

  const row = (octopSubject: string, extra: Record<string, string> = {}) => ({
    connectionId: 'octop-1',
    octopSubject,
    ...extra,
  });

  it('previews without writing, then commits atomically with an audit trail', async () => {
    const rows = [
      row('octop-alice', { externalIdentityId: aliceIdentity }),
      row('octop-bob', {
        issuer: ISSUER,
        subject: 'sub-bob',
        localUserId: bob,
      }),
    ];
    const preview = await harness.services.bindings.preview(rows);
    expect(preview.summary).toEqual({ create: 2, unchanged: 0, conflict: 0 });
    expect(await bindingRows()).toHaveLength(0);

    await harness.services.bindings.commit(rows, 'admin-1');
    const stored = await bindingRows();
    expect(stored).toHaveLength(2);
    expect(
      stored.find((entry) => entry.octopSubject === 'octop-alice'),
    ).toMatchObject({
      localUserId: alice,
      externalIdentityId: aliceIdentity,
      status: 'active',
      createdBy: 'admin-1',
    });
    const audit = await harness.services.audit.list({
      targetType: 'subjectBinding',
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      action: 'subjectBinding.create',
      actorId: 'admin-1',
    });
  });

  it('is idempotent: re-importing the same batch reports unchanged and adds nothing', async () => {
    const rows = [row('octop-alice', { externalIdentityId: aliceIdentity })];
    await harness.services.bindings.commit(rows, 'admin-1');
    const again = await harness.services.bindings.commit(rows, 'admin-1');
    expect(again.summary).toEqual({ create: 0, unchanged: 1, conflict: 0 });
    expect(await bindingRows()).toHaveLength(1);
  });

  it('SEC-02: rejects a row that claims an identity belongs to a different user', async () => {
    const rows = [
      row('octop-alice', {
        externalIdentityId: aliceIdentity,
        localUserId: bob,
      }),
    ];
    const preview = await harness.services.bindings.preview(rows);
    expect(preview.rows[0]).toMatchObject({
      status: 'conflict',
      conflicts: ['SUBJECT_MISMATCH'],
    });
    await expect(
      harness.services.bindings.commit(rows, 'admin-1'),
    ).rejects.toMatchObject({
      reason: 'SUBJECT_BINDING_CONFLICTS',
      status: 'ABORTED',
    });
    expect(await bindingRows()).toHaveLength(0);
  });

  it("SEC-02: a valid user presenting another user's Octop subject is refused and nothing is bound", async () => {
    await harness.services.bindings.commit(
      [row('octop-alice', { externalIdentityId: aliceIdentity })],
      'admin-1',
    );
    await expect(
      harness.services.bindings.assertSubjectOwnedBy({
        connectionId: 'octop-1',
        octopSubject: 'octop-alice',
        authenticatedUserId: bob,
      }),
    ).rejects.toMatchObject({
      reason: 'SUBJECT_MISMATCH',
      status: 'PERMISSION_DENIED',
    });
    await expect(
      harness.services.bindings.assertSubjectOwnedBy({
        connectionId: 'octop-1',
        octopSubject: 'octop-unknown',
        authenticatedUserId: bob,
      }),
    ).rejects.toMatchObject({ reason: 'SUBJECT_BINDING_REQUIRED' });
    expect(await bindingRows()).toHaveLength(1);

    await expect(
      harness.services.bindings.assertSubjectOwnedBy({
        connectionId: 'octop-1',
        octopSubject: 'octop-alice',
        authenticatedUserId: alice,
      }),
    ).resolves.toMatchObject({ localUserId: alice });
  });

  it('refuses to repoint an existing (connection, subject) at another identity', async () => {
    await harness.services.bindings.commit(
      [row('octop-alice', { externalIdentityId: aliceIdentity })],
      'admin-1',
    );
    const preview = await harness.services.bindings.preview([
      row('octop-alice', { externalIdentityId: bobIdentity }),
    ]);
    expect(preview.rows[0]).toMatchObject({
      status: 'conflict',
      conflicts: ['BINDING_CONFLICT'],
    });
  });

  it('refuses a second Octop subject for a local user on the same connection', async () => {
    await harness.services.bindings.commit(
      [row('octop-alice', { externalIdentityId: aliceIdentity })],
      'admin-1',
    );
    const preview = await harness.services.bindings.preview([
      row('octop-alice-2', { externalIdentityId: aliceIdentity }),
    ]);
    expect(preview.rows[0]?.conflicts).toEqual(['LOCAL_USER_ALREADY_BOUND']);
    const sameBatch = await harness.services.bindings.preview([
      row('octop-bob-1', { externalIdentityId: bobIdentity }),
      row('octop-bob-2', { externalIdentityId: bobIdentity }),
      row('octop-bob-1', { externalIdentityId: bobIdentity }),
    ]);
    expect(sameBatch.rows.map((entry) => entry.conflicts)).toEqual([
      [],
      ['LOCAL_USER_ALREADY_BOUND'],
      ['DUPLICATE_IN_BATCH'],
    ]);
  });

  it('reports unknown identities and missing references, and writes nothing for a mixed batch', async () => {
    const rows = [
      row('octop-alice', { externalIdentityId: aliceIdentity }),
      row('octop-ghost', { externalIdentityId: 'missing' }),
      row('octop-none'),
    ];
    const preview = await harness.services.bindings.preview(rows);
    expect(preview.rows.map((entry) => entry.status)).toEqual([
      'create',
      'conflict',
      'conflict',
    ]);
    expect(preview.rows[1]?.conflicts).toEqual(['EXTERNAL_IDENTITY_NOT_FOUND']);
    expect(preview.rows[2]?.conflicts).toEqual(['EXTERNAL_IDENTITY_REQUIRED']);
    await expect(
      harness.services.bindings.commit(rows, 'admin-1'),
    ).rejects.toMatchObject({
      reason: 'SUBJECT_BINDING_CONFLICTS',
    });
    expect(await bindingRows()).toHaveLength(0);
  });

  it('enforces uniqueness in the database for concurrent commits', async () => {
    const other = harness.spawnServices();
    const rows = [row('octop-alice', { externalIdentityId: aliceIdentity })];
    const results = await Promise.allSettled([
      harness.services.bindings.commit(rows, 'admin-1'),
      other.bindings.commit(rows, 'admin-2'),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await bindingRows()).toHaveLength(1);
  });
});
