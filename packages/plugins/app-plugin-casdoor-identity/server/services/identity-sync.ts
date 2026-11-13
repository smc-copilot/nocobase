import { randomUUID } from 'node:crypto';

import type { IdentityDirectory } from '../directory.js';
import { evaluateAdmission } from '../identity/admission.js';
import { extractIdentity } from '../identity/claims.js';
import {
  nowOf,
  type IdentityProviderRecord,
  type IdentityRuntime,
} from '../identity/model.js';
import {
  identityError,
  isUniqueViolation,
  readJson,
  str,
  strOrNull,
  toBool,
  toDate,
  toDateOrNull,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';
import type { IdentityProviderService } from './identity-providers.js';
import type { PermissionMappingService } from './permission-mapping.js';

export type SyncTrigger = 'scheduled' | 'manual' | 'preview';
export type SyncResult =
  'running' | 'succeeded' | 'partial' | 'failed' | 'preview';

export interface SyncCounts {
  examined: number;
  unbound: number;
  disabled: number;
  enabled: number;
  grantsAdded: number;
  grantsRevoked: number;
  unchanged: number;
  failed: number;
}

export interface SyncReportItem {
  readonly subject: string;
  readonly localUserId?: string;
  readonly actions: readonly string[];
  readonly error?: string;
}

export interface SyncRunRecord {
  readonly id: string;
  readonly batchId: string;
  readonly providerId: string;
  readonly trigger: SyncTrigger;
  readonly dryRun: boolean;
  readonly result: SyncResult;
  readonly cursor: string | null;
  readonly counts: SyncCounts;
  readonly report: readonly SyncReportItem[];
  readonly errorClass: string | null;
  readonly errorMessage: string | null;
  readonly actorId: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface RunSyncOptions {
  readonly providerId?: string;
  readonly trigger: SyncTrigger;
  /** Read-only: computes the same differences and writes nothing but the run record. */
  readonly dryRun?: boolean;
  readonly batchId?: string;
  readonly actorId?: string | null;
  /** Resume after a restart from the cursor a failed run recorded. */
  readonly cursor?: string;
}

const REPORT_LIMIT = 1000;
const STALE_RUN_MS = 30 * 60 * 1000;

function emptyCounts(): SyncCounts {
  return {
    examined: 0,
    unbound: 0,
    disabled: 0,
    enabled: 0,
    grantsAdded: 0,
    grantsRevoked: 0,
    unchanged: 0,
    failed: 0,
  };
}

function toRun(row: Record<string, unknown>): SyncRunRecord {
  return {
    id: str(row.id),
    batchId: str(row.batchId),
    providerId: str(row.providerId),
    trigger: str(row.trigger) as SyncTrigger,
    dryRun: toBool(row.dryRun),
    result: str(row.result) as SyncResult,
    cursor: strOrNull(row.cursor),
    counts: readJson<SyncCounts>(row.counts, emptyCounts()),
    report: readJson<SyncReportItem[]>(row.report, []),
    errorClass: strOrNull(row.errorClass),
    errorMessage: strOrNull(row.errorMessage),
    actorId: strOrNull(row.actorId),
    startedAt: toDate(row.startedAt),
    finishedAt: toDateOrNull(row.finishedAt),
  };
}

/**
 * Reconciles bound identities against the trusted directory: disables and re-enables local
 * users through the native `UserAdministrationService`, and re-applies Permission Set mapping.
 *
 * Disabling goes through `UserAdministrationService.disable`, which revokes sessions and realtime
 * connections. Re-enabling clears the disabled flag only; sessions revoked at disable time stay
 * revoked and the user authenticates again. The adapter re-enables only users *it* disabled.
 */
export class IdentitySyncService {
  /** Reported by the status API: how periodic reconciliation is driven in this process. */
  public schedulerMode: 'scheduler' | 'timer' | 'none' = 'none';
  private readonly running = new Set<string>();

  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly providers: IdentityProviderService,
    private readonly mapping: PermissionMappingService,
    private readonly audit: IdentityAuditLog,
    private readonly directory: () => IdentityDirectory | undefined,
  ) {}

  public async resolveProvider(
    providerId?: string,
  ): Promise<IdentityProviderRecord> {
    const wanted = providerId ?? this.runtime.config().sync?.providerId;
    if (wanted) {
      const provider = await this.providers.findByProviderId(wanted);
      if (!provider) {
        throw identityError(
          'NOT_FOUND',
          'IDENTITY_PROVIDER_NOT_FOUND',
          `Identity provider ${wanted} was not found.`,
        );
      }
      return provider;
    }
    const enabled = (await this.providers.list()).filter(
      (provider) => provider.enabled,
    );
    if (enabled.length !== 1) {
      throw identityError(
        'FAILED_PRECONDITION',
        'IDENTITY_PROVIDER_AMBIGUOUS',
        'Name a providerId: exactly one enabled identity provider is required to default to it.',
      );
    }
    return enabled[0];
  }

  public async listRuns(
    options: { readonly providerId?: string; readonly limit?: number } = {},
  ): Promise<readonly SyncRunRecord[]> {
    let query = this.runtime
      .database()
      .connection()
      .query.selectFrom('identitySyncRuns')
      .selectAll();
    if (options.providerId)
      query = query.where('providerId', '=', options.providerId);
    const rows = await query
      .orderBy('startedAt', 'desc')
      .limit(Math.min(options.limit ?? 20, 100))
      .execute();
    return rows.map((row: Record<string, unknown>) => toRun(row));
  }

  public async getRun(batchId: string): Promise<SyncRunRecord | undefined> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('identitySyncRuns')
      .selectAll()
      .where('batchId', '=', batchId)
      .executeTakeFirst();
    return row ? toRun(row) : undefined;
  }

  public async status(): Promise<{
    readonly schedulerMode: 'scheduler' | 'timer' | 'none';
    readonly directoryConfigured: boolean;
    readonly providers: readonly {
      readonly providerId: string;
      readonly enabled: boolean;
      readonly lastRun: SyncRunRecord | null;
      readonly lastSuccessAt: Date | null;
    }[];
  }> {
    const providers = await this.providers.list();
    const entries = [];
    for (const provider of providers) {
      const runs = await this.listRuns({
        providerId: provider.providerId,
        limit: 20,
      });
      const real = runs.filter((run) => !run.dryRun);
      entries.push({
        providerId: provider.providerId,
        enabled: provider.enabled,
        lastRun: real[0] ?? null,
        lastSuccessAt:
          real.find((run) => run.result === 'succeeded')?.finishedAt ?? null,
      });
    }
    return {
      schedulerMode: this.schedulerMode,
      directoryConfigured: this.directory() !== undefined,
      providers: entries,
    };
  }

  public async run(options: RunSyncOptions): Promise<SyncRunRecord> {
    const directory = this.directory();
    if (!directory) {
      throw identityError(
        'FAILED_PRECONDITION',
        'DIRECTORY_NOT_CONFIGURED',
        'No identity directory is configured: set casdoorIdentity.directory or register identityDirectoryToken.',
      );
    }
    const provider = await this.resolveProvider(options.providerId);
    const dryRun = options.dryRun === true || options.trigger === 'preview';
    if (!provider.enabled && !dryRun) {
      throw identityError(
        'FAILED_PRECONDITION',
        'IDENTITY_PROVIDER_DISABLED',
        'The identity provider is disabled.',
      );
    }
    await this.assertNotRunning(provider.providerId);

    const connection = this.runtime.database().connection();
    const id = randomUUID();
    const batchId =
      options.batchId ?? `sync-${Date.now().toString(36)}-${id.slice(0, 8)}`;
    const startedAt = nowOf(this.runtime);
    try {
      await connection.query
        .insertInto('identitySyncRuns')
        .values({
          id,
          batchId,
          providerId: provider.providerId,
          trigger: options.trigger,
          dryRun,
          result: 'running',
          cursor: options.cursor ?? null,
          counts: JSON.stringify(emptyCounts()),
          report: JSON.stringify([]),
          errorClass: null,
          errorMessage: null,
          actorId: options.actorId ?? null,
          startedAt,
          finishedAt: null,
          createdAt: startedAt,
        })
        .execute();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw identityError(
          'ALREADY_EXISTS',
          'SYNC_BATCH_EXISTS',
          `Sync batch ${batchId} already exists; use a new batchId to rerun.`,
        );
      }
      throw error;
    }

    this.running.add(provider.providerId);
    const counts = emptyCounts();
    const report: SyncReportItem[] = [];
    let cursor: string | undefined = options.cursor;
    let errorClass: string | null = null;
    let errorMessage: string | null = null;
    try {
      const pageSize = this.runtime.config().sync?.pageSize ?? 100;
      do {
        const page = await directory.listUsers(provider, {
          ...(cursor ? { cursor } : {}),
          pageSize,
        });
        for (const user of page.users) {
          counts.examined += 1;
          let item: SyncReportItem | undefined;
          try {
            item = await this.processUser(provider, user, dryRun, counts);
          } catch (error) {
            counts.failed += 1;
            item = {
              subject: user.subject,
              actions: [],
              error: (error instanceof Error
                ? error.message
                : String(error)
              ).slice(0, 300),
            };
          }
          if (
            item &&
            item.actions.length + (item.error ? 1 : 0) > 0 &&
            report.length < REPORT_LIMIT
          ) {
            report.push(item);
          }
        }
        cursor = page.nextCursor;
        await this.saveProgress(id, cursor, counts);
      } while (cursor);
    } catch (error) {
      errorClass = error instanceof Error ? error.name : 'Error';
      errorMessage = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 500);
    } finally {
      this.running.delete(provider.providerId);
    }

    const result: SyncResult = errorClass
      ? 'failed'
      : dryRun
        ? 'preview'
        : counts.failed > 0
          ? 'partial'
          : 'succeeded';
    const finishedAt = nowOf(this.runtime);
    await connection.query
      .updateTable('identitySyncRuns')
      .set({
        result,
        cursor: cursor ?? null,
        counts: JSON.stringify(counts),
        report: JSON.stringify(report),
        errorClass,
        errorMessage,
        finishedAt,
      })
      .where('id', '=', id)
      .execute();
    await this.audit.record({
      action: dryRun ? 'identitySync.preview' : 'identitySync.run',
      actorId: options.actorId ?? null,
      targetType: 'identitySyncRun',
      targetId: batchId,
      details: { providerId: provider.providerId, result, counts },
    });
    return (await this.getRun(batchId))!;
  }

  private async assertNotRunning(providerId: string): Promise<void> {
    let busy = this.running.has(providerId);
    if (!busy) {
      const row = await this.runtime
        .database()
        .connection()
        .query.selectFrom('identitySyncRuns')
        .select('startedAt')
        .where('providerId', '=', providerId)
        .where('result', '=', 'running')
        .orderBy('startedAt', 'desc')
        .executeTakeFirst();
      busy =
        !!row &&
        nowOf(this.runtime).getTime() - toDate(row.startedAt).getTime() <
          STALE_RUN_MS;
    }
    if (busy) {
      throw identityError(
        'ABORTED',
        'SYNC_ALREADY_RUNNING',
        'A sync for this provider is already running.',
      );
    }
  }

  private async saveProgress(
    id: string,
    cursor: string | undefined,
    counts: SyncCounts,
  ): Promise<void> {
    await this.runtime
      .database()
      .connection()
      .query.updateTable('identitySyncRuns')
      .set({ cursor: cursor ?? null, counts: JSON.stringify(counts) })
      .where('id', '=', id)
      .execute();
  }

  private async processUser(
    provider: IdentityProviderRecord,
    directoryUser: {
      readonly subject: string;
      readonly enabled: boolean;
      readonly attributes: Readonly<Record<string, unknown>>;
    },
    dryRun: boolean,
    counts: SyncCounts,
  ): Promise<SyncReportItem | undefined> {
    const connection = this.runtime.database().connection();
    const binding = await connection.query
      .selectFrom('externalIdentities')
      .select(['id', 'localUserId', 'disabledBySyncAt'])
      .where('providerIssuer', '=', provider.issuer)
      .where('providerSubject', '=', directoryUser.subject)
      .executeTakeFirst();
    if (!binding) {
      // Sync reconciles identities that have logged in or been pre-bound; it creates nobody.
      counts.unbound += 1;
      return undefined;
    }
    const localUserId = str(binding.localUserId);
    const user = await connection.query
      .selectFrom('user')
      .select(['id', 'disabledAt', 'deletedAt'])
      .where('id', '=', localUserId)
      .executeTakeFirst();
    if (!user || user.deletedAt != null) return undefined;

    const identity = extractIdentity(
      provider.issuer,
      directoryUser.subject,
      directoryUser.attributes,
      provider.claimMapping,
    );
    const admitted = evaluateAdmission(
      provider.admissionPolicy,
      identity,
    ).allowed;
    const desiredEnabled = directoryUser.enabled && admitted;
    const disabled = user.disabledAt != null;
    const sources = this.runtime.users();
    const now = nowOf(this.runtime);
    const actions: string[] = [];
    let effectivelyEnabled = !disabled;

    if (!desiredEnabled && !disabled) {
      actions.push(admitted ? 'disable:directory' : 'disable:admission');
      counts.disabled += 1;
      if (!dryRun) {
        await sources.disable(localUserId);
        await connection.query
          .updateTable('externalIdentities')
          .set({
            lastSeenEnabled: false,
            disabledBySyncAt: now,
            lastSyncedAt: now,
            // Directory authority snapshot: JWT login maps from this, not from groups in the token.
            directoryAttributes: { ...directoryUser.attributes },
            directoryObservedAt: now,
            updatedAt: now,
          })
          .where('id', '=', binding.id)
          .execute();
      }
      effectivelyEnabled = false;
    } else if (desiredEnabled && disabled && binding.disabledBySyncAt != null) {
      actions.push('enable');
      counts.enabled += 1;
      if (!dryRun) {
        await sources.enable(localUserId);
        // Enabling restores nothing: make sure no session outlives the disable.
        await sources.revokeSessions(localUserId);
        await connection.query
          .updateTable('externalIdentities')
          .set({
            lastSeenEnabled: true,
            disabledBySyncAt: null,
            lastSyncedAt: now,
            directoryAttributes: { ...directoryUser.attributes },
            directoryObservedAt: now,
            updatedAt: now,
          })
          .where('id', '=', binding.id)
          .execute();
      }
      effectivelyEnabled = true;
    } else if (desiredEnabled && disabled) {
      actions.push('keep-disabled:local');
      if (!dryRun) {
        await connection.query
          .updateTable('externalIdentities')
          .set({
            directoryAttributes: { ...directoryUser.attributes },
            directoryObservedAt: now,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where('id', '=', binding.id)
          .execute();
      }
    } else if (!dryRun) {
      await connection.query
        .updateTable('externalIdentities')
        .set({
          lastSeenEnabled: desiredEnabled,
          lastSyncedAt: now,
          directoryAttributes: { ...directoryUser.attributes },
          directoryObservedAt: now,
          updatedAt: now,
        })
        .where('id', '=', binding.id)
        .execute();
    }

    const reconciled = effectivelyEnabled
      ? await this.mapping.reconcileIdentity(
          localUserId,
          provider.providerId,
          identity,
          { dryRun },
        )
      : await this.mapping.reconcileUser(localUserId, [], {
          revision: 'disabled',
          dryRun,
        });
    for (const key of reconciled.granted) actions.push(`grant:${key}`);
    for (const key of reconciled.revoked) actions.push(`revoke:${key}`);
    counts.grantsAdded += reconciled.granted.length;
    counts.grantsRevoked += reconciled.revoked.length;
    if (actions.length === 0) counts.unchanged += 1;
    return { subject: directoryUser.subject, localUserId, actions };
  }
}
