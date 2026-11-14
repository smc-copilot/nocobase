import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  JsonObject,
  ScheduleDefinition,
  ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import type { SchedulerService } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ApiError } from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import {
  CasdoorIdentityAuthorizationProvider,
  IDENTITY_SETTINGS_SECTION,
} from '../../server/authorization.js';
import {
  IDENTITY_SYNC_SCHEDULE_KEY,
  IDENTITY_SYNC_TARGET_TYPE,
  SETTINGS_MAPPING,
  SETTINGS_SUBJECT_BINDINGS,
  SETTINGS_SYNC,
} from '../../server/config.js';
import { registerIdentitySyncSchedule } from '../../server/scheduling.js';
import type {
  IdentitySyncService,
  RunSyncOptions,
  SyncRunRecord,
} from '../../server/services/identity-sync.js';

describe('authz.settings registration', () => {
  it('registers the identity admin surfaces and places them in the administration workspace', async () => {
    const authz = createAppAuthorization({});
    const container = new ServiceContainer();
    container.instance(authorizationToken, authz);
    await new CasdoorIdentityAuthorizationProvider({
      container,
    } as AppPluginApplication).boot();

    expect(authz.ui.sections.get(IDENTITY_SETTINGS_SECTION)).toMatchObject({
      parent: 'administration',
    });
    for (const [id, actions] of [
      [SETTINGS_SYNC, ['read', 'run']],
      [SETTINGS_MAPPING, ['read', 'configure']],
      [SETTINGS_SUBJECT_BINDINGS, ['read', 'import', 'revoke']],
    ] as const) {
      expect(
        authz.resourceTypes
          .get('settings')
          .items?.get(id)
          ?.actions.map((entry) => entry.name),
      ).toEqual(actions);
      expect(authz.ui.placementOf({ type: 'settings', id })).toEqual({
        section: IDENTITY_SETTINGS_SECTION,
      });
      expect(authz.settings.grant(id, [actions[0]])).toEqual({
        resource: { type: 'settings', id },
        actions: [{ action: actions[0] }],
      });
    }
  });

  it('registers nothing without the authorization plugin', async () => {
    await expect(
      new CasdoorIdentityAuthorizationProvider({
        container: new ServiceContainer(),
      } as AppPluginApplication).boot(),
    ).resolves.toBeUndefined();
  });
});

describe('periodic sync scheduling (IAM-006)', () => {
  function fakeScheduler() {
    const targets: ScheduleTargetType<JsonObject>[] = [];
    const schedules: ScheduleDefinition[] = [];
    const scheduler = {
      registerTarget: (target: ScheduleTargetType<JsonObject>) => {
        targets.push(target);
        return { type: target.type, reportCompletion: () => Promise.resolve() };
      },
      defineSchedule: (definition: ScheduleDefinition) => {
        schedules.push(definition);
      },
      drain: () => Promise.resolve(),
    } as unknown as SchedulerService;
    return { scheduler, targets, schedules };
  }
  const run = (overrides: Partial<SyncRunRecord> = {}): SyncRunRecord =>
    ({
      batchId: 'b1',
      result: 'succeeded',
      errorClass: null,
      counts: { examined: 3, failed: 0 },
      ...overrides,
    }) as SyncRunRecord;

  it('registers a Scheduler target and a cron schedule', () => {
    const { scheduler, targets, schedules } = fakeScheduler();
    registerIdentitySyncSchedule(
      scheduler,
      { run: () => Promise.resolve(run()) } as unknown as IdentitySyncService,
      undefined,
    );
    expect(targets[0]).toMatchObject({ type: IDENTITY_SYNC_TARGET_TYPE });
    expect(schedules[0]).toMatchObject({
      key: IDENTITY_SYNC_SCHEDULE_KEY,
      schedule: { cron: '*/15 * * * *', timezone: 'UTC' },
      target: { type: IDENTITY_SYNC_TARGET_TYPE, config: {} },
    });
  });

  it('honors the configured cron and provider, and the schedule definition is valid', async () => {
    const { defineSchedule } =
      await import('@nocobase/app-plugin-scheduler/server');
    const { scheduler, schedules } = fakeScheduler();
    registerIdentitySyncSchedule(
      scheduler,
      { run: () => Promise.resolve(run()) } as unknown as IdentitySyncService,
      { cron: '0 * * * *', timezone: 'Asia/Shanghai', providerId: 'casdoor' },
    );
    expect(schedules[0]).toMatchObject({
      schedule: { cron: '0 * * * *', timezone: 'Asia/Shanghai' },
      target: { config: { providerId: 'casdoor' } },
    });
    expect(() => defineSchedule(schedules[0]!)).not.toThrow();
  });

  it('the target runs one scheduled batch and maps outcomes to Scheduler results', async () => {
    const { scheduler, targets } = fakeScheduler();
    const calls: RunSyncOptions[] = [];
    let next: () => Promise<SyncRunRecord> = () => Promise.resolve(run());
    registerIdentitySyncSchedule(
      scheduler,
      {
        run: (options: RunSyncOptions) => {
          calls.push(options);
          return next();
        },
      } as unknown as IdentitySyncService,
      { providerId: 'casdoor' },
    );
    const target = targets[0]!;
    const context = { scheduleId: 's', occurrenceId: 'o' };

    expect(target.validate({})).toEqual({ valid: true });
    expect(target.validate({ providerId: 5 })).toMatchObject({ valid: false });

    await expect(
      target.start({ providerId: 'casdoor' }, context),
    ).resolves.toMatchObject({
      state: 'completed',
      outcome: 'succeeded',
      result: { batchId: 'b1', examined: 3 },
    });
    expect(calls[0]).toMatchObject({
      trigger: 'scheduled',
      providerId: 'casdoor',
    });

    next = () =>
      Promise.resolve(run({ result: 'failed', errorClass: 'DirectoryError' }));
    await expect(target.start({}, context)).resolves.toEqual({
      state: 'failed',
      reason: 'DirectoryError',
    });

    next = () =>
      Promise.reject(
        new ApiError({
          status: 'ABORTED',
          reason: 'SYNC_ALREADY_RUNNING',
          domain: 'casdoorIdentity',
          message: 'busy',
        }),
      );
    await expect(target.start({}, context)).resolves.toEqual({
      state: 'skipped',
      reason: 'sync-already-running',
    });

    next = () => Promise.reject(new Error('boom'));
    await expect(target.start({}, context)).resolves.toEqual({
      state: 'failed',
      reason: 'boom',
    });
  });
});
