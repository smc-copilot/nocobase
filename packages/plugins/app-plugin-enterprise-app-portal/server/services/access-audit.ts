import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import { str, strOrNull, toDate } from './values.js';

export interface AccessAuditEntry {
  readonly actorUserId?: string | null;
  readonly appCode?: string | null;
  readonly action: string;
  readonly result: 'success' | 'denied' | 'unavailable' | 'conflict';
  readonly reason?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface AccessAuditRecord {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly appCode: string | null;
  readonly action: string;
  readonly result: 'success' | 'denied' | 'unavailable' | 'conflict';
  readonly reason: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
}

function toRecord(row: Record<string, unknown>): AccessAuditRecord {
  let metadata: Record<string, unknown> | null = null;
  if (typeof row.metadata === 'string' && row.metadata.length > 0) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  } else if (row.metadata && typeof row.metadata === 'object') {
    metadata = row.metadata as Record<string, unknown>;
  }
  return {
    id: str(row.id),
    actorUserId: strOrNull(row.actorUserId),
    appCode: strOrNull(row.appCode),
    action: str(row.action),
    result: str(row.result) as AccessAuditRecord['result'],
    reason: strOrNull(row.reason),
    metadata,
    createdAt: toDate(row.createdAt),
  };
}

/**
 * Append-only access and catalog audit. Never persist secrets, tokens or raw IdP payloads.
 */
export class AccessAuditLog {
  constructor(private readonly database: () => DatabaseManager) {}

  public async record(entry: AccessAuditEntry): Promise<void> {
    await this.database()
      .connection()
      .query.insertInto('enterprisePortalAuditEvents')
      .values({
        id: randomUUID(),
        actorUserId: entry.actorUserId ?? null,
        appCode: entry.appCode ?? null,
        action: entry.action,
        result: entry.result,
        reason: entry.reason ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        createdAt: new Date(),
      })
      .execute();
  }

  public async list(limit = 50): Promise<readonly AccessAuditRecord[]> {
    const rows = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalAuditEvents')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 200))
      .execute();
    return rows.map((row: Record<string, unknown>) => toRecord(row));
  }
}
