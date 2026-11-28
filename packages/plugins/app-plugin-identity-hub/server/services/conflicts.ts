import type {
  ActorContext,
  ConflictStatus,
  Page,
  PageQuery,
} from '../model.js';
import { isConflictStatus, pageWindow } from '../model.js';
import { hubError } from '../errors.js';
import {
  iso,
  isoOrNull,
  readJson,
  str,
  strOrNull,
  toDate,
  toDateOrNull,
  writeJson,
} from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { IdentityAuditLog } from './audit.js';

export interface EnqueueConflictInput {
  readonly conflictType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly personId?: string | null;
  readonly providerId?: string | null;
}

export interface ConflictView {
  readonly conflictId: string;
  readonly conflictType: string;
  readonly status: ConflictStatus;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly personId: string | null;
  readonly providerId: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export class ConflictQueue {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async enqueue(
    input: EnqueueConflictInput,
    actor?: ActorContext,
  ): Promise<ConflictView> {
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      const conflictId = this.runtime.id();
      await connection.query
        .insertInto(tables.conflicts)
        .values({
          conflictId,
          conflictType: input.conflictType,
          status: 'open',
          payload: writeJson(input.payload),
          personId: input.personId ?? null,
          providerId: input.providerId ?? null,
          createdAt: now,
          resolvedAt: null,
        })
        .execute();
      await this.audit.append(
        {
          action: 'conflict.opened',
          actorId: actor?.actorId,
          personId: input.personId,
          providerId: input.providerId,
          requestId: actor?.requestId,
          entityType: 'conflict',
          entityId: conflictId,
          details: {
            conflictType: input.conflictType,
            payload: input.payload,
          },
        },
        connection,
      );
      return this.require(conflictId, connection);
    });
  }

  public async list(
    query: PageQuery & { readonly status?: ConflictStatus } = {},
  ): Promise<Page<ConflictView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    let listed = connection.query.selectFrom(tables.conflicts).selectAll();
    let counted = connection.query
      .selectFrom(tables.conflicts)
      .select(({ fn }) => [fn.countAll().as('total')]);
    if (query.status) {
      listed = listed.where('status', '=', query.status);
      counted = counted.where('status', '=', query.status);
    }
    const [rows, countRow] = await Promise.all([
      listed
        .orderBy('createdAt', 'desc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      counted.executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toConflict(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public async get(conflictId: string): Promise<ConflictView> {
    return this.require(conflictId);
  }

  public async resolve(
    conflictId: string,
    status: 'resolved' | 'rejected',
    actor?: ActorContext,
  ): Promise<ConflictView> {
    const current = await this.require(conflictId);
    if (current.status !== 'open') {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_CONFLICT_NOT_OPEN',
        'Only an open conflict can be resolved.',
      );
    }
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.conflicts)
        .set({ status, resolvedAt: now })
        .where('conflictId', '=', conflictId)
        .execute();
      await this.audit.append(
        {
          action: 'conflict.resolved',
          actorId: actor?.actorId,
          personId: current.personId,
          providerId: current.providerId,
          requestId: actor?.requestId,
          entityType: 'conflict',
          entityId: conflictId,
          details: { status },
        },
        connection,
      );
      return this.require(conflictId, connection);
    });
  }

  private async require(
    conflictId: string,
    connection = this.runtime.database.connection(),
  ): Promise<ConflictView> {
    const row = await connection.query
      .selectFrom(tables.conflicts)
      .selectAll()
      .where('conflictId', '=', conflictId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_CONFLICT_NOT_FOUND',
        'The conflict was not found.',
      );
    }
    return toConflict(row);
  }
}

function toConflict(row: Record<string, unknown>): ConflictView {
  const status = str(row.status);
  return {
    conflictId: str(row.conflictId),
    conflictType: str(row.conflictType),
    status: isConflictStatus(status) ? status : 'open',
    payload: readJson<Record<string, unknown>>(row.payload, {}),
    personId: strOrNull(row.personId),
    providerId: strOrNull(row.providerId),
    createdAt: iso(toDate(row.createdAt)),
    resolvedAt: isoOrNull(toDateOrNull(row.resolvedAt)),
  };
}
