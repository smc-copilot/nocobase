import { randomUUID } from 'node:crypto';

import type { DatabaseConnection } from '@nocobase/db';

import { nowOf, type IdentityRuntime } from '../identity/model.js';
import { readJson, str, strOrNull, toDate } from '../identity/rows.js';

export interface IdentityAuditEventInput {
  readonly action: string;
  readonly actorId?: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface IdentityAuditEvent {
  readonly id: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

/** Append-only record of identity administration changes. Never carries secrets or tokens. */
export class IdentityAuditLog {
  constructor(private readonly runtime: IdentityRuntime) {}

  public async record(
    event: IdentityAuditEventInput,
    connection: DatabaseConnection = this.runtime.database().connection(),
  ): Promise<void> {
    await connection.query
      .insertInto('identityAuditEvents')
      .values({
        id: randomUUID(),
        action: event.action,
        actorId: event.actorId ?? null,
        targetType: event.targetType,
        targetId: event.targetId,
        details: JSON.stringify(event.details ?? {}),
        createdAt: nowOf(this.runtime),
      })
      .execute();
  }

  public async list(
    filter: { readonly targetType?: string; readonly targetId?: string } = {},
    limit = 100,
  ): Promise<readonly IdentityAuditEvent[]> {
    let query = this.runtime
      .database()
      .connection()
      .query.selectFrom('identityAuditEvents')
      .selectAll();
    if (filter.targetType)
      query = query.where('targetType', '=', filter.targetType);
    if (filter.targetId) query = query.where('targetId', '=', filter.targetId);
    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row: Record<string, unknown>) => ({
      id: str(row.id),
      action: str(row.action),
      actorId: strOrNull(row.actorId),
      targetType: str(row.targetType),
      targetId: str(row.targetId),
      details: readJson<Record<string, unknown>>(row.details, {}),
      createdAt: toDate(row.createdAt),
    }));
  }
}
