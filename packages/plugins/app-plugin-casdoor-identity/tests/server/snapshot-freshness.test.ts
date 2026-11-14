// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

describe('Directory snapshot freshness (NEXT-05 / N22)', () => {
  let harness: IdentityHarness;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor'],
      sync: { snapshotMaxAgeSeconds: 60 },
    });
  });
  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'managedPermissionAssignments',
      'identityMappingRules',
      'identityProviders',
      'externalIdentities',
      'user',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
  });

  it('fails closed when a directory-authoritative snapshot is stale', async () => {
    await registerProvider(harness);
    const login = await harness.services.provisioning.onLogin({
      issuer: ISSUER,
      subject: 'stale-user',
      attributes: {
        owner: 'acme',
        email: 'stale@acme.test',
        email_verified: true,
      },
    });
    const observedAt = new Date(Date.now() - 120_000);
    await harness.database
      .connection()
      .query.updateTable('externalIdentities')
      .set({
        directoryObservedAt: observedAt,
        directoryAttributes: { owner: 'acme', groups: ['editors'] },
      })
      .where('id', '=', login.bindingId)
      .execute();

    await expect(
      harness.services.provisioning.assertDirectorySnapshotFresh(
        login.localUserId,
      ),
    ).rejects.toMatchObject({ reason: 'DIRECTORY_SNAPSHOT_STALE' });

    await expect(
      harness.services.provisioning.onLogin({
        issuer: ISSUER,
        subject: 'stale-user',
        attributes: {
          owner: 'acme',
          email: 'stale@acme.test',
          email_verified: true,
        },
      }),
    ).rejects.toMatchObject({ reason: 'DIRECTORY_SNAPSHOT_STALE' });
  });

  it('allows identities that have never been directory-synced', async () => {
    await registerProvider(harness);
    const login = await harness.services.provisioning.onLogin({
      issuer: ISSUER,
      subject: 'jit-user',
      attributes: {
        owner: 'acme',
        email: 'jit@acme.test',
        email_verified: true,
      },
    });
    await expect(
      harness.services.provisioning.assertDirectorySnapshotFresh(
        login.localUserId,
      ),
    ).resolves.toBeUndefined();
  });
});
