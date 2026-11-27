import { expect, test } from 'vitest';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';

import { MeetingOaIdentityService } from '../../server/meetings/oa/identity-service.js';
import { MeetingOaSettingsService } from '../../server/meetings/oa/settings-service.js';
import type { MeetingOaAdapter } from '../../server/meetings/oa/adapter.js';
import type { MeetingOaConfig } from '../../server/config/meeting-oa.js';

const authz = {
  authorize: async () => ({ effect: 'allow' }),
} as unknown as AuthorizationContext;

const emptyConnection = {
  repository: () => ({
    findOne: async () => undefined,
    findMany: async () => [],
    createOne: async () => undefined,
    updateOne: async () => undefined,
  }),
} as unknown as DatabaseConnection;

test('resolveCreator requires live probe outside test adapter', async () => {
  const denied = new MeetingOaIdentityService(
    emptyConnection,
    authz,
    'user-1',
    undefined,
    false,
    async () => ({
      liveVerified: false,
      employeeNo: null,
      reason: 'cookie_missing',
    }),
  );
  await expect(denied.resolveCreator({})).resolves.toEqual({
    denyReason: 'OA_LIVE_SESSION_REQUIRED',
  });

  const allowed = new MeetingOaIdentityService(
    emptyConnection,
    authz,
    'user-1',
    undefined,
    false,
    async () => ({
      liveVerified: true,
      employeeNo: 'smc-sz-hr21007',
      reason: 'verified',
    }),
  );
  await expect(allowed.resolveCreator({})).resolves.toEqual({
    creatorUserId: 'user-1',
    creatorEmployeeNo: 'smc-sz-hr21007',
  });
});

test('current identity exposes liveVerified and canSync from the probe', async () => {
  const missing = new MeetingOaIdentityService(
    emptyConnection,
    authz,
    'user-1',
    undefined,
    false,
    async () => ({
      liveVerified: false,
      employeeNo: null,
      reason: 'username_mismatch',
    }),
  );
  await expect(missing.current()).resolves.toMatchObject({
    canSync: false,
    liveVerified: false,
    denyReason: 'OA_LIVE_SESSION_REQUIRED',
    liveVerifyReason: 'username_mismatch',
  });

  const verified = new MeetingOaIdentityService(
    emptyConnection,
    authz,
    'user-1',
    undefined,
    false,
    async () => ({
      liveVerified: true,
      employeeNo: 'smc-sz-hr21007',
      reason: 'verified',
    }),
  );
  await expect(verified.current()).resolves.toMatchObject({
    canSync: true,
    liveVerified: true,
    employeeNo: 'smc-sz-hr21007',
    denyReason: null,
    liveVerifyReason: 'verified',
  });
});

test('adapter identity still uses employee maps without a live cookie', async () => {
  const mappedConnection = {
    repository: () => ({
      findOne: async () => ({
        id: 'map-1',
        userId: 'user-1',
        employeeNo: 'E1001',
        displayName: 'Alice',
        status: 'active',
      }),
      findMany: async () => [],
      createOne: async () => undefined,
      updateOne: async () => undefined,
    }),
  } as unknown as DatabaseConnection;

  const identity = new MeetingOaIdentityService(
    mappedConnection,
    authz,
    'user-1',
    undefined,
    true,
  );
  await expect(identity.current()).resolves.toMatchObject({
    canSync: true,
    employeeNo: 'E1001',
    liveVerified: false,
    denyReason: null,
  });
  await expect(identity.resolveCreator({})).resolves.toEqual({
    creatorUserId: 'user-1',
    creatorEmployeeNo: 'E1001',
  });
});

test('settings public row reports liveVerified from the probe', async () => {
  const adapter = { kind: 'http' } as MeetingOaAdapter;
  const config = {
    timeoutMs: 15_000,
    testAdapter: false,
  } satisfies MeetingOaConfig;

  const blocked = new MeetingOaSettingsService(
    authz,
    adapter,
    config,
    async () => ({
      liveVerified: false,
      employeeNo: null,
      reason: 'cookie_missing',
    }),
  );
  await expect(blocked.get()).resolves.toMatchObject({
    liveVerified: false,
    liveVerifyReason: 'cookie_missing',
    testAdapter: false,
  });

  const verified = new MeetingOaSettingsService(
    authz,
    adapter,
    config,
    async () => ({
      liveVerified: true,
      employeeNo: 'smc-sz-hr21007',
      reason: 'verified',
    }),
  );
  await expect(verified.get()).resolves.toMatchObject({
    liveVerified: true,
    liveVerifyReason: 'verified',
  });
});
