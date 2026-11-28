import type { DatabaseConnection } from '@nocobase/db';

import type { Page, PageQuery } from '../model.js';
import { pageWindow } from '../model.js';
import { readJson, str, strOrNull, toDate, writeJson } from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';

const SECRET_KEY =
  /password|secret|token|credential|authorization|privatekey|apikey/iu;

export interface AuditDraft {
  readonly action: string;
  readonly result?: string;
  readonly actorId?: string | null;
  readonly personId?: string | null;
  readonly providerId?: string | null;
  readonly appId?: string | null;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AuditEventView {
  readonly eventId: string;
  readonly actorId: string | null;
  readonly personId: string | null;
  readonly providerId: string | null;
  readonly appId: string | null;
  readonly action: string;
  readonly result: string;
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/** Drops secret-like keys anywhere in a JSON value before it is stored or published. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(child);
    }
    return output;
  }
  return value;
}

export class IdentityAuditLog {
  public constructor(private readonly runtime: HubRuntime) {}

  public async append(
    event: AuditDraft,
    connection: DatabaseConnection,
  ): Promise<AuditEventView> {
    const details = redactSecrets(event.details ?? {}) as Record<
      string,
      unknown
    >;
    const row: AuditEventView = {
      eventId: this.runtime.id(),
      actorId: event.actorId ?? null,
      personId: event.personId ?? null,
      providerId: event.providerId ?? null,
      appId: event.appId ?? null,
      action: event.action,
      result: event.result ?? 'success',
      reason: event.reason ?? null,
      requestId: event.requestId ?? null,
      details,
      createdAt: this.runtime.now().toISOString(),
    };
    await connection.query
      .insertInto(tables.audit)
      .values({
        eventId: row.eventId,
        actorId: row.actorId,
        personId: row.personId,
        providerId: row.providerId,
        appId: row.appId,
        action: row.action,
        result: row.result,
        reason: row.reason,
        requestId: row.requestId,
        details: writeJson(details),
        createdAt: this.runtime.now(),
      })
      .execute();
    await this.runtime.outbox.publish(
      {
        type: row.action,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: details,
      },
      { transaction: connection },
    );
    return row;
  }

  public async list(
    query: PageQuery & {
      readonly personId?: string;
      readonly action?: string;
    } = {},
  ): Promise<Page<AuditEventView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    let listed = connection.query.selectFrom(tables.audit).selectAll();
    let counted = connection.query
      .selectFrom(tables.audit)
      .select(({ fn }) => [fn.countAll().as('total')]);
    if (query.personId) {
      listed = listed.where('personId', '=', query.personId);
      counted = counted.where('personId', '=', query.personId);
    }
    if (query.action) {
      listed = listed.where('action', '=', query.action);
      counted = counted.where('action', '=', query.action);
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
      items: rows.map((row) => toAudit(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }
}

function toAudit(row: Record<string, unknown>): AuditEventView {
  return {
    eventId: str(row.eventId),
    actorId: strOrNull(row.actorId),
    personId: strOrNull(row.personId),
    providerId: strOrNull(row.providerId),
    appId: strOrNull(row.appId),
    action: str(row.action),
    result: str(row.result),
    reason: strOrNull(row.reason),
    requestId: strOrNull(row.requestId),
    details: readJson<Record<string, unknown>>(row.details, {}),
    createdAt: toDate(row.createdAt).toISOString(),
  };
}
