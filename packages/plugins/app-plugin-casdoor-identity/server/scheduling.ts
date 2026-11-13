import type { JsonObject } from '@nocobase/app-plugin-scheduler/server';
import type { SchedulerService } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ApiError } from '@nocobase/app-server/router';

import {
  DEFAULT_SYNC_CRON,
  IDENTITY_SYNC_SCHEDULE_KEY,
  IDENTITY_SYNC_TARGET_TYPE,
  type CasdoorIdentitySyncConfig,
} from './config.js';
import type { IdentitySyncService } from './services/identity-sync.js';

type SyncTargetConfig = JsonObject & { readonly providerId?: string };

/**
 * Registers periodic reconciliation with the native Scheduler: a target that runs one sync batch
 * and a schedule that fires it, so administrators see it under Scheduler like any other job.
 */
export function registerIdentitySyncSchedule(
  scheduler: SchedulerService,
  sync: IdentitySyncService,
  config: CasdoorIdentitySyncConfig | undefined,
): void {
  scheduler.registerTarget<SyncTargetConfig>({
    type: IDENTITY_SYNC_TARGET_TYPE,
    title: 'Identity directory sync',
    validate: (value) =>
      value !== null &&
      typeof value === 'object' &&
      ((value as SyncTargetConfig).providerId === undefined ||
        typeof (value as SyncTargetConfig).providerId === 'string')
        ? { valid: true }
        : { valid: false, reason: 'providerId-must-be-a-string' },
    async start(target) {
      try {
        const run = await sync.run({
          trigger: 'scheduled',
          ...(target.providerId ? { providerId: target.providerId } : {}),
        });
        if (run.result === 'failed') {
          return { state: 'failed', reason: run.errorClass ?? 'sync-failed' };
        }
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: {
            batchId: run.batchId,
            result: run.result,
            examined: run.counts.examined,
            failed: run.counts.failed,
          },
        };
      } catch (error) {
        // An overlapping run is not a failure of this one.
        if (
          error instanceof ApiError &&
          error.reason === 'SYNC_ALREADY_RUNNING'
        ) {
          return { state: 'skipped', reason: 'sync-already-running' };
        }
        return {
          state: 'failed',
          reason:
            error instanceof Error
              ? error.message.slice(0, 200)
              : 'sync-failed',
        };
      }
    },
  });
  const providerId = config?.providerId;
  scheduler.defineSchedule({
    key: IDENTITY_SYNC_SCHEDULE_KEY,
    title: 'Identity directory sync',
    description:
      'Reconciles bound external identities with the identity directory: disables, re-enables and re-maps Permission Sets.',
    schedule: {
      cron: config?.cron ?? DEFAULT_SYNC_CRON,
      timezone: config?.timezone ?? 'UTC',
    },
    target: {
      type: IDENTITY_SYNC_TARGET_TYPE,
      config: providerId ? { providerId } : {},
    },
  });
}
