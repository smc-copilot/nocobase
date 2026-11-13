// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  DirectoryUser,
  IdentityDirectory,
} from '../../server/directory.js';
import {
  createIdentityHarness,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

function staticDirectory(
  users: () => readonly DirectoryUser[],
  options: { pageSize?: number; fail?: Error } = {},
): IdentityDirectory {
  return {
    async listUsers(_provider, { cursor, pageSize }) {
      if (options.fail) throw options.fail;
      const size = options.pageSize ?? pageSize;
      const start = cursor ? Number(cursor) : 0;
      const all = users();
      const next = start + size;
      return {
        users: all.slice(start, next),
        ...(next < all.length ? { nextCursor: String(next) } : {}),
      };
    },
  };
}

const person = (
  subject: string,
  overrides: Partial<DirectoryUser> & { groups?: string[] } = {},
): DirectoryUser => ({
  subject,
  enabled: overrides.enabled ?? true,
  attributes: {
    owner: 'acme',
    groups: overrides.groups ?? [],
    ...overrides.attributes,
  },
});

describe('identity sync, disable and re-enable (IAM-005..IAM-008, IAM-010)', () => {
  let harness: IdentityHarness;
  let directoryUsers: DirectoryUser[];
  let userId: string;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor'],
    });
  });
  afterAll(async () => {
    await harness.close();
  });

  const isDisabled = async (): Promise<boolean> =>
    (await harness.users.get(userId))!.disabledAt != null;
  const assigned = async (): Promise<string[]> =>
    (await harness.authz.permissionSets.listAssignments())
      .filter((entry) => entry.subject.id === userId)
      .map((entry) => entry.permissionSet);

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'managedPermissionAssignments',
      'identityMappingRules',
      'identitySyncRuns',
      'identityProviders',
      'externalIdentities',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    for (const entry of await harness.authz.permissionSets.listAssignments()) {
      if (entry.subject.type === 'user')
        await harness.authz.permissionSets.revoke(entry.id);
    }
    await query.deleteFrom('session').allowAllRows().execute();
    await query.deleteFrom('account').allowAllRows().execute();
    await query.deleteFrom('user').allowAllRows().execute();

    userId = await harness.createLocalUser('sync@acme.test');
    await harness.bind('sub-1', userId);
    await registerProvider(harness);
    await harness.services.mapping.createRule(
      {
        ruleId: 'r-editors',
        providerId: 'casdoor',
        claim: 'groups',
        claimValue: 'editors',
        permissionSetKey: 'content-editor',
      },
      null,
    );
    directoryUsers = [person('sub-1', { groups: ['editors'] })];
    harness.directory.current = staticDirectory(() => directoryUsers);
  });

  const run = (options: { batchId?: string; dryRun?: boolean } = {}) =>
    harness.services.sync.run({
      trigger: 'manual',
      providerId: 'casdoor',
      ...options,
    });

  it('reconciles mapping for bound users and records the batch', async () => {
    const result = await run({ batchId: 'batch-1' });
    expect(result).toMatchObject({ batchId: 'batch-1', result: 'succeeded' });
    expect(result.counts).toMatchObject({
      examined: 1,
      grantsAdded: 1,
      failed: 0,
    });
    expect(await assigned()).toEqual(['content-editor']);
    expect(result.report).toEqual([
      {
        subject: 'sub-1',
        localUserId: userId,
        actions: ['grant:content-editor'],
      },
    ]);
  });

  it('counts directory users that have never logged in as unbound and creates nobody', async () => {
    directoryUsers = [person('sub-1'), person('sub-stranger')];
    const result = await run();
    expect(result.counts).toMatchObject({ examined: 2, unbound: 1 });
    expect(
      (
        await harness.database
          .connection()
          .query.selectFrom('user')
          .select('id')
          .execute()
      ).length,
    ).toBe(1);
  });

  it('disables a user the directory reports forbidden: sessions revoked, managed grants withdrawn', async () => {
    await run();
    await harness.signIn('sync@acme.test');
    expect(await harness.sessionCount(userId)).toBeGreaterThan(0);

    directoryUsers = [person('sub-1', { enabled: false, groups: ['editors'] })];
    const result = await run();
    expect(result.counts).toMatchObject({ disabled: 1 });
    expect(await isDisabled()).toBe(true);
    expect(await harness.sessionCount(userId)).toBe(0);
    expect(await assigned()).toEqual([]);
    const identityRow = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .select(['lastSeenEnabled', 'disabledBySyncAt'])
      .where('providerSubject', '=', 'sub-1')
      .executeTakeFirst();
    expect(identityRow?.disabledBySyncAt).not.toBeNull();
  });

  it('disables a user the admission policy no longer admits', async () => {
    directoryUsers = [person('sub-1', { attributes: { owner: 'elsewhere' } })];
    const result = await run();
    expect(result.report[0]?.actions).toContain('disable:admission');
    expect(await isDisabled()).toBe(true);
  });

  it('re-enables only what it disabled and does not restore revoked sessions', async () => {
    await harness.signIn('sync@acme.test');
    directoryUsers = [person('sub-1', { enabled: false })];
    await run();
    expect(await isDisabled()).toBe(true);

    directoryUsers = [person('sub-1', { groups: ['editors'] })];
    const result = await run();
    expect(result.counts).toMatchObject({ enabled: 1 });
    expect(await isDisabled()).toBe(false);
    expect(await harness.sessionCount(userId)).toBe(0);
    expect(await assigned()).toEqual(['content-editor']);
  });

  it('never re-enables a user an administrator disabled by hand', async () => {
    await harness.users.disable(userId);
    const result = await run();
    expect(result.report[0]?.actions).toContain('keep-disabled:local');
    expect(await isDisabled()).toBe(true);
  });

  it('dry run reports the differences without writing', async () => {
    const preview = await harness.services.sync.run({
      trigger: 'preview',
      providerId: 'casdoor',
      batchId: 'preview-1',
    });
    expect(preview).toMatchObject({ result: 'preview', dryRun: true });
    expect(preview.report[0]?.actions).toEqual(['grant:content-editor']);
    expect(await assigned()).toEqual([]);
    expect(await harness.services.mapping.managedRows(userId)).toHaveLength(0);
  });

  it('pages through the directory and persists the cursor', async () => {
    const other = await harness.createLocalUser('two@acme.test');
    await harness.bind('sub-2', other);
    directoryUsers = [person('sub-1'), person('sub-2')];
    harness.directory.current = staticDirectory(() => directoryUsers, {
      pageSize: 1,
    });
    const result = await run();
    expect(result.counts.examined).toBe(2);
    expect(result.cursor).toBeNull();
  });

  it('records a directory failure with its error class and lets a later batch rerun', async () => {
    harness.directory.current = staticDirectory(() => directoryUsers, {
      fail: new RangeError('directory unreachable'),
    });
    const failed = await run({ batchId: 'batch-fail' });
    expect(failed).toMatchObject({
      result: 'failed',
      errorClass: 'RangeError',
      errorMessage: 'directory unreachable',
    });
    await expect(run({ batchId: 'batch-fail' })).rejects.toMatchObject({
      reason: 'SYNC_BATCH_EXISTS',
    });
    harness.directory.current = staticDirectory(() => directoryUsers);
    expect(await run({ batchId: 'batch-rerun' })).toMatchObject({
      result: 'succeeded',
    });

    const status = await harness.services.sync.status();
    expect(status.providers[0]).toMatchObject({ providerId: 'casdoor' });
    expect(status.providers[0]?.lastRun?.batchId).toBe('batch-rerun');
    expect(status.providers[0]?.lastSuccessAt).not.toBeNull();
  });

  it('refuses to run without a directory', async () => {
    harness.directory.current = undefined;
    await expect(run()).rejects.toMatchObject({
      reason: 'DIRECTORY_NOT_CONFIGURED',
    });
  });
});
