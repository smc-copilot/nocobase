import type { ActorContext, Page, PageQuery } from '../model.js';
import { pageWindow } from '../model.js';
import { hubError } from '../errors.js';
import {
  isoOrNull,
  readJson,
  str,
  strOrNull,
  toDateOrNull,
  writeJson,
} from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import {
  claimMappingFrom,
  extractIdentity,
} from '../adapters/claim-mapping.js';
import type {
  DirectoryUser,
  IdentityDirectoryConnector,
  ProviderHealth,
  VerifiedIdentity,
} from '../adapters/types.js';
import type { IdentityAuditLog } from './audit.js';
import type { ConflictQueue } from './conflicts.js';
import type { IdentityLinkService } from './identities.js';
import type { PersonService } from './persons.js';
import type { ProviderRegistry, ProviderView } from './providers.js';

const maxPages = 100;
const previewPageSize = 20;
const runPageSize = 50;
const maxFailures = 50;

export interface SyncFailure {
  readonly externalId: string | null;
  readonly reason: string;
}

export interface SyncStats {
  readonly created: number;
  readonly linked: number;
  readonly updated: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly skipped: number;
  readonly failures: readonly SyncFailure[];
}

export type SyncProposalAction =
  'create' | 'link' | 'update' | 'conflict' | 'skip';

export interface SyncProposal {
  readonly externalId: string;
  readonly identityKey: string;
  readonly externalUsername: string | null;
  readonly displayName: string | null;
  readonly action: SyncProposalAction;
  readonly personId: string | null;
  readonly reason: string | null;
}

export interface SyncPreview {
  readonly providerId: string;
  readonly proposals: readonly SyncProposal[];
}

export type SyncRunStatus = 'running' | 'succeeded' | 'failed';

export interface SyncRunView {
  readonly batchId: string;
  readonly providerId: string;
  readonly status: SyncRunStatus;
  readonly stats: SyncStats;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly error: string | null;
}

interface MutableStats {
  created: number;
  linked: number;
  updated: number;
  conflicts: number;
  failed: number;
  skipped: number;
  failures: SyncFailure[];
}

/**
 * Directory sync stays inside Identity Hub. It never calls an application local-user API.
 */
export class IdentitySyncService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly adapters: AdapterRegistry,
    private readonly providers: ProviderRegistry,
    private readonly persons: PersonService,
    private readonly identities: IdentityLinkService,
    private readonly conflicts: ConflictQueue,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async testConnection(
    providerId: string,
    actor?: ActorContext,
  ): Promise<ProviderHealth> {
    const adapter = await this.adapters.resolve(providerId);
    const health = await adapter.healthCheck();
    await this.providers.recordHealthCheck(providerId, actor);
    return health;
  }

  public async syncPreview(
    providerId: string,
    _actor?: ActorContext,
  ): Promise<SyncPreview> {
    const directory = await this.directoryOf(providerId);
    const page = await directory.listUsers({ pageSize: previewPageSize });
    const proposals: SyncProposal[] = [];
    for (const user of page.items) {
      proposals.push(await this.plan(providerId, user));
    }
    return { providerId, proposals };
  }

  public async syncRun(
    providerId: string,
    actor?: ActorContext,
  ): Promise<SyncRunView> {
    const provider = await this.providers.get(providerId);
    const directory = await this.directoryOf(providerId);
    const stats = emptyStats();
    const batchId = await this.startRun(providerId, actor);
    try {
      await this.eachPage(directory, async (user) => {
        try {
          await this.applyUser(provider, user, actor, stats);
        } catch (error) {
          await this.noteUserError(providerId, user, error, actor, stats);
        }
      });
      return this.finishRun(batchId, 'succeeded', stats, null, actor);
    } catch (error) {
      return this.finishRun(batchId, 'failed', stats, errorText(error), actor);
    }
  }

  public async listSyncRuns(
    providerId: string,
    query: PageQuery = {},
  ): Promise<Page<SyncRunView>> {
    await this.providers.get(providerId);
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    const [rows, countRow] = await Promise.all([
      connection.query
        .selectFrom(tables.syncRuns)
        .selectAll()
        .where('providerId', '=', providerId)
        .orderBy('startedAt', 'desc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      connection.query
        .selectFrom(tables.syncRuns)
        .select(({ fn }) => [fn.countAll().as('total')])
        .where('providerId', '=', providerId)
        .executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toSyncRun(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  private async directoryOf(
    providerId: string,
  ): Promise<IdentityDirectoryConnector> {
    const adapter = await this.adapters.resolve(providerId);
    const directory = adapter.directory?.();
    if (!directory) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_DIRECTORY_UNAVAILABLE',
        'This provider has no directory connector.',
      );
    }
    return directory;
  }

  private async plan(
    providerId: string,
    user: DirectoryUser,
  ): Promise<SyncProposal> {
    const base = {
      externalId: user.externalId,
      identityKey: user.identityKey,
      externalUsername: user.externalUsername ?? null,
      displayName: user.displayName ?? null,
    };
    if (!user.externalId.trim() || !user.identityKey.trim()) {
      return {
        ...base,
        action: 'skip',
        personId: null,
        reason: 'STABLE_SUBJECT_REQUIRED',
      };
    }
    const existing = await this.identities.findByIdentityKey(
      providerId,
      user.identityKey,
    );
    if (existing && existing.status !== 'unlinked') {
      if (user.employeeNo) {
        const owner = await this.persons.findByEmployeeNo(user.employeeNo);
        if (owner && owner.personId !== existing.personId) {
          return {
            ...base,
            action: 'conflict',
            personId: existing.personId,
            reason: 'EMPLOYEE_NO_OWNER_DIFFERS',
          };
        }
      }
      return {
        ...base,
        action: 'update',
        personId: existing.personId,
        reason: null,
      };
    }
    if (user.employeeNo) {
      const owner = await this.persons.findByEmployeeNo(user.employeeNo);
      if (owner) {
        return {
          ...base,
          action: 'link',
          personId: owner.personId,
          reason: null,
        };
      }
    }
    return { ...base, action: 'create', personId: null, reason: null };
  }

  private async applyUser(
    provider: ProviderView,
    user: DirectoryUser,
    actor: ActorContext | undefined,
    stats: MutableStats,
  ): Promise<void> {
    const proposal = await this.plan(provider.providerId, user);
    if (proposal.action === 'skip') {
      stats.skipped += 1;
      return;
    }
    if (proposal.action === 'conflict') {
      await this.conflicts.enqueue(
        {
          conflictType: 'sync_conflict',
          payload: {
            identityKey: user.identityKey,
            externalId: user.externalId,
            employeeNo: user.employeeNo ?? null,
            reason: proposal.reason,
          },
          personId: proposal.personId,
          providerId: provider.providerId,
        },
        actor,
      );
      stats.conflicts += 1;
      return;
    }
    const verified = verifiedFrom(provider, user);
    if (proposal.action === 'update' || proposal.action === 'link') {
      await this.identities.upsertVerified(
        requiredPersonId(proposal.personId),
        verified,
        actor,
      );
      if (proposal.action === 'update') stats.updated += 1;
      else stats.linked += 1;
      return;
    }
    const person = await this.persons.create(
      {
        displayName: displayNameOf(user),
        employeeNo: user.employeeNo ?? null,
        email: user.email ?? null,
        username: usernameOf(user),
        sourceAuthority: {
          providerId: provider.providerId,
          identityKey: user.identityKey,
        },
      },
      actor,
    );
    await this.identities.upsertVerified(person.personId, verified, actor);
    stats.created += 1;
  }

  private async noteUserError(
    providerId: string,
    user: DirectoryUser,
    error: unknown,
    actor: ActorContext | undefined,
    stats: MutableStats,
  ): Promise<void> {
    const reason = errorReason(error);
    if (
      reason === 'IDENTITY_HUB_DUPLICATE_EMPLOYEE_NO' ||
      reason === 'IDENTITY_HUB_IDENTITY_ALREADY_LINKED'
    ) {
      if (reason === 'IDENTITY_HUB_IDENTITY_ALREADY_LINKED') {
        await this.conflicts.enqueue(
          {
            conflictType: 'identity_already_linked',
            payload: {
              identityKey: user.identityKey,
              externalId: user.externalId,
              reason,
            },
            providerId,
          },
          actor,
        );
      }
      stats.conflicts += 1;
      return;
    }
    stats.failed += 1;
    if (stats.failures.length < maxFailures) {
      stats.failures.push({
        externalId: user.externalId || null,
        reason,
      });
    }
  }

  private async eachPage(
    directory: IdentityDirectoryConnector,
    visit: (user: DirectoryUser) => Promise<void>,
  ): Promise<void> {
    let cursor: string | null | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await directory.listUsers({
        pageSize: runPageSize,
        cursor,
      });
      for (const user of result.items) await visit(user);
      if (!result.nextCursor) return;
      cursor = result.nextCursor;
    }
  }

  private async startRun(
    providerId: string,
    actor?: ActorContext,
  ): Promise<string> {
    return this.runtime.transaction(async (connection) => {
      const batchId = this.runtime.id();
      const now = this.runtime.now();
      await connection.query
        .insertInto(tables.syncRuns)
        .values({
          batchId,
          providerId,
          status: 'running',
          stats: writeJson(snapshot(emptyStats())),
          startedAt: now,
          finishedAt: null,
          error: null,
        })
        .execute();
      await this.audit.append(
        {
          action: 'sync.started',
          actorId: actor?.actorId,
          providerId,
          requestId: actor?.requestId,
          entityType: 'syncRun',
          entityId: batchId,
          details: {},
        },
        connection,
      );
      return batchId;
    });
  }

  private async finishRun(
    batchId: string,
    status: 'succeeded' | 'failed',
    stats: MutableStats,
    error: string | null,
    actor?: ActorContext,
  ): Promise<SyncRunView> {
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      const stored = snapshot(stats);
      await connection.query
        .updateTable(tables.syncRuns)
        .set({
          status,
          stats: writeJson(stored),
          finishedAt: now,
          error,
        })
        .where('batchId', '=', batchId)
        .execute();
      const row = await connection.query
        .selectFrom(tables.syncRuns)
        .selectAll()
        .where('batchId', '=', batchId)
        .executeTakeFirst();
      await this.audit.append(
        {
          action: 'sync.finished',
          actorId: actor?.actorId,
          providerId: str(
            (row as { providerId?: unknown } | undefined)?.providerId,
          ),
          requestId: actor?.requestId,
          entityType: 'syncRun',
          entityId: batchId,
          result: status === 'succeeded' ? 'success' : 'failure',
          details: { status, stats: stored, error },
        },
        connection,
      );
      return toSyncRun(row as Record<string, unknown>);
    });
  }
}

function verifiedFrom(
  provider: ProviderView,
  user: DirectoryUser,
): VerifiedIdentity {
  const issuer = provider.issuer ?? provider.providerId;
  return {
    providerId: provider.providerId,
    providerType: provider.providerType,
    issuer,
    subject: user.externalId,
    externalId: user.externalId,
    ...(user.externalUsername
      ? { externalUsername: user.externalUsername }
      : {}),
    identityKey: user.identityKey,
    claims: extractIdentity(
      issuer,
      user.externalId,
      user.attributes,
      claimMappingFrom(provider.claimMapping),
    ),
  };
}

function displayNameOf(user: DirectoryUser): string {
  return (
    user.displayName?.trim() ||
    user.externalUsername?.trim() ||
    user.externalId ||
    'Directory user'
  );
}

function usernameOf(user: DirectoryUser): string | null {
  const username = user.externalUsername?.trim();
  if (!username || username.length > 128) return null;
  return username;
}

function requiredPersonId(personId: string | null): string {
  if (!personId) {
    throw hubError(
      'FAILED_PRECONDITION',
      'IDENTITY_HUB_SYNC_PERSON_REQUIRED',
      'Linking a directory user needs an existing person.',
    );
  }
  return personId;
}

function emptyStats(): MutableStats {
  return {
    created: 0,
    linked: 0,
    updated: 0,
    conflicts: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };
}

function snapshot(stats: MutableStats): SyncStats {
  return {
    created: stats.created,
    linked: stats.linked,
    updated: stats.updated,
    conflicts: stats.conflicts,
    failed: stats.failed,
    skipped: stats.skipped,
    failures: stats.failures.map((failure) => ({ ...failure })),
  };
}

function errorReason(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'reason' in error &&
    typeof error.reason === 'string'
  ) {
    return error.reason;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'SYNC_USER_FAILED';
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Directory sync failed.';
}

const runStatuses = new Set<SyncRunStatus>(['running', 'succeeded', 'failed']);

function toSyncRun(row: Record<string, unknown>): SyncRunView {
  const status = str(row.status);
  return {
    batchId: str(row.batchId),
    providerId: str(row.providerId),
    status: runStatuses.has(status as SyncRunStatus)
      ? (status as SyncRunStatus)
      : 'failed',
    stats: readJson<SyncStats>(row.stats, snapshot(emptyStats())),
    startedAt: isoOrNull(toDateOrNull(row.startedAt)),
    finishedAt: isoOrNull(toDateOrNull(row.finishedAt)),
    error: strOrNull(row.error),
  };
}
