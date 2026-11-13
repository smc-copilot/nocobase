// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { extractIdentity } from '../../server/identity/claims.js';
import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

const identity = (groups: string[], owner = 'acme') =>
  extractIdentity(ISSUER, 'sub-map', { owner, groups });

describe('Permission Set mapping and ownership (IAM-004, IAM-005)', () => {
  let harness: IdentityHarness;
  let userId: string;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor', 'reports-viewer', 'root'],
    });
  });
  afterAll(async () => {
    await harness.close();
  });

  const assignedSets = async (): Promise<string[]> =>
    (await harness.authz.permissionSets.listAssignments())
      .filter((entry) => entry.subject.id === userId)
      .map((entry) => entry.permissionSet)
      .sort();

  beforeEach(async () => {
    const { query } = harness.database.connection();
    await query
      .deleteFrom('managedPermissionAssignments')
      .allowAllRows()
      .execute();
    await query.deleteFrom('identityMappingRules').allowAllRows().execute();
    await query.deleteFrom('identityProviders').allowAllRows().execute();
    for (const entry of await harness.authz.permissionSets.listAssignments()) {
      if (entry.subject.type === 'user')
        await harness.authz.permissionSets.revoke(entry.id);
    }
    await query.deleteFrom('user').allowAllRows().execute();
    userId = await harness.createLocalUser('mapped@acme.test');
    await registerProvider(harness);
  });

  const rule = (
    ruleId: string,
    claimValue: string,
    permissionSetKey: string,
    claim = 'groups',
  ) =>
    harness.services.mapping.createRule(
      { ruleId, providerId: 'casdoor', claim, claimValue, permissionSetKey },
      'admin-1',
    );

  it('grants only the allowlisted sets that an enabled rule maps from a trusted claim', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    await rule('r-org', 'acme', 'reports-viewer', 'organization');
    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    expect(result.granted.sort()).toEqual(['content-editor', 'reports-viewer']);
    expect(await assignedSets()).toEqual(['content-editor', 'reports-viewer']);
    const rows = await harness.services.mapping.managedRows(userId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.sourceRevision.length === 32)).toBe(true);
  });

  it('never lets a token string name a set: unknown claims grant nothing', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      extractIdentity(ISSUER, 'sub', {
        owner: 'acme',
        groups: ['root', 'content-editor'],
      }),
    );
    expect(result.granted).toEqual([]);
    expect(await assignedSets()).toEqual([]);
  });

  it('refuses rules for sets off the allowlist, missing sets, and root', async () => {
    await expect(rule('r-fin', 'x', 'finance')).rejects.toMatchObject({
      reason: 'PERMISSION_SET_NOT_MAPPABLE',
    });
    await expect(rule('r-root', 'x', 'root')).rejects.toMatchObject({
      reason: 'PERMISSION_SET_NOT_MAPPABLE',
    });
    await expect(
      rule('r-gone', 'x', 'content-editor').then(() =>
        rule('r-gone', 'y', 'content-editor'),
      ),
    ).rejects.toMatchObject({ reason: 'MAPPING_RULE_EXISTS' });
  });

  it('re-checks the allowlist when applying: a set removed from it is skipped, not granted', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    harness.config.current = { mappablePermissionSets: [] };
    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    expect(result.granted).toEqual([]);
    expect(result.skipped).toEqual([
      { permissionSetKey: 'content-editor', reason: 'NOT_MAPPABLE' },
    ]);
    harness.config.current = {
      mappablePermissionSets: ['content-editor', 'reports-viewer', 'root'],
    };
  });

  it('revokes only adapter-managed grants and leaves manual ones alone', async () => {
    await harness.authz.permissionSets.assign({
      subject: { type: 'user', id: userId },
      permissionSet: 'finance',
    });
    await rule('r-editors', 'editors', 'content-editor');
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    expect(await assignedSets()).toEqual(['content-editor', 'finance']);

    // The claim goes away: the managed grant is withdrawn, the manual one stays.
    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity([]),
    );
    expect(result.revoked).toEqual(['content-editor']);
    expect(await assignedSets()).toEqual(['finance']);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(0);
  });

  it('does not adopt a manually assigned set, so it is never revoked later', async () => {
    await harness.authz.permissionSets.assign({
      subject: { type: 'user', id: userId },
      permissionSet: 'content-editor',
    });
    await rule('r-editors', 'editors', 'content-editor');

    const granted = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    expect(granted.granted).toEqual([]);
    expect(granted.skipped).toEqual([
      {
        permissionSetKey: 'content-editor',
        reason: 'MANUAL_ASSIGNMENT_EXISTS',
      },
    ]);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(0);

    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity([]),
    );
    expect(await assignedSets()).toEqual(['content-editor']);
  });

  it('I04: does not claim a manual replacement after the managed assignment was deleted', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    const managed = (await harness.services.mapping.managedRows(userId))[0]!;

    // Simulate: tracked assignment A was deleted and a person created B. The live assignment
    // remains for the set, but our managed row still points at the deleted assignment id.
    await harness.database
      .connection()
      .query.updateTable('managedPermissionAssignments')
      .set({ assignmentId: 'deleted-assignment-id' })
      .where('id', '=', managed.id)
      .execute();

    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    expect(result.granted).toEqual([]);
    expect(result.skipped).toEqual([
      {
        permissionSetKey: 'content-editor',
        reason: 'MANUAL_ASSIGNMENT_EXISTS',
      },
    ]);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(0);
    expect(await assignedSets()).toEqual(['content-editor']);

    // A later reconcile that no longer desires the set must leave the manual grant alone.
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity([]),
    );
    expect(await assignedSets()).toEqual(['content-editor']);
  });

  it('keeps a set both rules want until the last rule stops matching', async () => {
    await rule('r-a', 'a', 'content-editor');
    await rule('r-b', 'b', 'content-editor');
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['a', 'b']),
    );
    expect(await assignedSets()).toEqual(['content-editor']);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(2);

    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['b']),
    );
    expect(await assignedSets()).toEqual(['content-editor']);
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity([]),
    );
    expect(await assignedSets()).toEqual([]);
  });

  it('re-stamps sourceRevision when the rules change and withdraws grants when a rule is deleted', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    const before = (await harness.services.mapping.managedRows(userId))[0]!
      .sourceRevision;

    await rule('r-viewers', 'viewers', 'reports-viewer');
    await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
    );
    const after = (await harness.services.mapping.managedRows(userId))[0]!
      .sourceRevision;
    expect(after).not.toBe(before);

    await harness.services.mapping.deleteRule('r-editors', 'admin-1');
    expect(await assignedSets()).toEqual([]);
    const audit = await harness.services.audit.list({
      targetType: 'mappingRule',
    });
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(['mappingRule.create', 'mappingRule.delete']),
    );
  });

  it('dry run reports differences and writes nothing', async () => {
    await rule('r-editors', 'editors', 'content-editor');
    const result = await harness.services.mapping.reconcileIdentity(
      userId,
      'casdoor',
      identity(['editors']),
      { dryRun: true },
    );
    expect(result.granted).toEqual(['content-editor']);
    expect(await assignedSets()).toEqual([]);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(0);
  });
});
