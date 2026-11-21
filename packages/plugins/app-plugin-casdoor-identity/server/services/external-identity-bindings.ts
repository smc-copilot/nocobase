import { randomUUID } from 'node:crypto';

import type { DatabaseConnection } from '@nocobase/db';

import { nowOf, type IdentityRuntime } from '../identity/model.js';
import {
  identityError,
  isUniqueViolation,
  str,
  strOrNull,
  toDate,
  toDateOrNull,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';

export interface ExternalIdentityBindingInput {
  readonly issuer: string;
  readonly subject: string;
  /** Trusted employee number; matches `user.username` exactly after lowercase trim. */
  readonly employeeNo?: string;
  /** Optional explicit local user; must agree with the employee-number match. */
  readonly localUserId?: string;
}

export type ExternalIdentityBindingConflict =
  | 'DUPLICATE_IN_BATCH'
  | 'EMPLOYEE_NO_REQUIRED'
  | 'EMPLOYEE_NO_NOT_FOUND'
  | 'EMPLOYEE_NO_AMBIGUOUS'
  | 'SUBJECT_ALREADY_BOUND'
  | 'LOCAL_USER_ALREADY_BOUND'
  | 'ACCOUNT_DISABLED'
  | 'SUBJECT_MISMATCH'
  | 'EMAIL_AUTO_MERGE_FORBIDDEN';

export interface ExternalIdentityBindingPreviewRow {
  readonly index: number;
  readonly issuer: string;
  readonly subject: string;
  readonly employeeNo?: string;
  readonly status: 'create' | 'unchanged' | 'conflict';
  readonly conflicts: readonly ExternalIdentityBindingConflict[];
  readonly localUserId?: string;
  readonly bindingId?: string;
}

export interface ExternalIdentityBindingPreview {
  readonly rows: readonly ExternalIdentityBindingPreviewRow[];
  readonly summary: {
    readonly create: number;
    readonly unchanged: number;
    readonly conflict: number;
  };
}

export interface ExternalIdentityBindingRecord {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly localUserId: string;
  readonly username: string | null;
  readonly disabledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function normalizeEmployeeNo(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}

/**
 * Administrator import of Casdoor `(issuer, subject)` onto existing local employees.
 *
 * Matching is only by trusted `employeeNo` → `user.username`. E-mail is never a merge key.
 * `businessUiSubjectBindings` is a different table and is never written here.
 */
export class ExternalIdentityBindingService {
  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async list(
    options: { readonly issuer?: string; readonly limit?: number } = {},
  ): Promise<readonly ExternalIdentityBindingRecord[]> {
    let query = this.runtime
      .database()
      .connection()
      .query.selectFrom('externalIdentities')
      .leftJoin('user', 'user.id', 'externalIdentities.localUserId')
      .select([
        'externalIdentities.id as id',
        'externalIdentities.providerIssuer as issuer',
        'externalIdentities.providerSubject as subject',
        'externalIdentities.localUserId as localUserId',
        'externalIdentities.createdAt as createdAt',
        'externalIdentities.updatedAt as updatedAt',
        'user.username as username',
        'user.disabledAt as disabledAt',
      ]);
    if (options.issuer)
      query = query.where(
        'externalIdentities.providerIssuer',
        '=',
        options.issuer,
      );
    const rows = await query
      .orderBy('externalIdentities.createdAt', 'desc')
      .limit(Math.min(options.limit ?? 50, 200))
      .execute();
    return rows.map((row: Record<string, unknown>) => ({
      id: str(row.id),
      issuer: str(row.issuer),
      subject: str(row.subject),
      localUserId: str(row.localUserId),
      username: strOrNull(row.username),
      disabledAt: toDateOrNull(row.disabledAt),
      createdAt: toDate(row.createdAt),
      updatedAt: toDate(row.updatedAt),
    }));
  }

  public async preview(
    rows: readonly ExternalIdentityBindingInput[],
    connection: DatabaseConnection = this.runtime.database().connection(),
  ): Promise<ExternalIdentityBindingPreview> {
    const seenSubjects = new Map<string, number>();
    const seenUsers = new Map<string, string>();
    const results: ExternalIdentityBindingPreviewRow[] = [];

    for (const [index, input] of rows.entries()) {
      const issuer = input.issuer.trim();
      const subject = input.subject.trim();
      const employeeNo = normalizeEmployeeNo(input.employeeNo);
      const conflicts: ExternalIdentityBindingConflict[] = [];
      const subjectKey = `${issuer}\n${subject}`;
      if (seenSubjects.has(subjectKey)) conflicts.push('DUPLICATE_IN_BATCH');
      seenSubjects.set(subjectKey, index);

      const existing = await connection.query
        .selectFrom('externalIdentities')
        .select(['id', 'localUserId'])
        .where('providerIssuer', '=', issuer)
        .where('providerSubject', '=', subject)
        .executeTakeFirst();

      let localUserId: string | undefined;
      let bindingId: string | undefined;
      let status: ExternalIdentityBindingPreviewRow['status'] = 'create';

      if (!employeeNo && !existing) {
        conflicts.push('EMPLOYEE_NO_REQUIRED');
      }

      if (existing) {
        bindingId = str(existing.id);
        localUserId = str(existing.localUserId);
        const boundUser = await this.loadUser(connection, localUserId);
        if (!boundUser) {
          conflicts.push('EMPLOYEE_NO_NOT_FOUND');
        } else if (toDateOrNull(boundUser.disabledAt) != null) {
          conflicts.push('ACCOUNT_DISABLED');
        }
        if (employeeNo) {
          const matches = await this.findByUsername(connection, employeeNo);
          if (matches.length === 0) conflicts.push('EMPLOYEE_NO_NOT_FOUND');
          if (matches.length > 1) conflicts.push('EMPLOYEE_NO_AMBIGUOUS');
          if (matches.length === 1 && str(matches[0].id) !== localUserId) {
            conflicts.push('SUBJECT_MISMATCH');
          }
        }
        if (input.localUserId && input.localUserId !== localUserId) {
          conflicts.push('SUBJECT_MISMATCH');
        }
        status = conflicts.length > 0 ? 'conflict' : 'unchanged';
      } else if (employeeNo) {
        const matches = await this.findByUsername(connection, employeeNo);
        if (matches.length === 0) conflicts.push('EMPLOYEE_NO_NOT_FOUND');
        if (matches.length > 1) conflicts.push('EMPLOYEE_NO_AMBIGUOUS');
        if (matches.length === 1) {
          localUserId = str(matches[0].id);
          if (toDateOrNull(matches[0].disabledAt) != null) {
            conflicts.push('ACCOUNT_DISABLED');
          }
          if (input.localUserId && input.localUserId !== localUserId) {
            conflicts.push('SUBJECT_MISMATCH');
          }
          const other = await connection.query
            .selectFrom('externalIdentities')
            .select(['id', 'providerSubject'])
            .where('providerIssuer', '=', issuer)
            .where('localUserId', '=', localUserId)
            .executeTakeFirst();
          const otherInBatch = seenUsers.get(`${issuer}\n${localUserId}`);
          if (
            (other && str(other.providerSubject) !== subject) ||
            (otherInBatch && otherInBatch !== subject)
          ) {
            conflicts.push('LOCAL_USER_ALREADY_BOUND');
          }
          seenUsers.set(`${issuer}\n${localUserId}`, subject);
        }
      }

      if (conflicts.length > 0) status = 'conflict';
      results.push({
        index,
        issuer,
        subject,
        ...(employeeNo ? { employeeNo } : {}),
        status,
        conflicts,
        ...(localUserId ? { localUserId } : {}),
        ...(bindingId ? { bindingId } : {}),
      });
    }

    return {
      rows: results,
      summary: {
        create: results.filter((row) => row.status === 'create').length,
        unchanged: results.filter((row) => row.status === 'unchanged').length,
        conflict: results.filter((row) => row.status === 'conflict').length,
      },
    };
  }

  public async commit(
    rows: readonly ExternalIdentityBindingInput[],
    actorId: string | null,
  ): Promise<ExternalIdentityBindingPreview> {
    const database = this.runtime.database();
    const now = nowOf(this.runtime);
    let preview: ExternalIdentityBindingPreview | undefined;
    try {
      preview = await database.transaction(async (connection) => {
        const checked = await this.preview(rows, connection);
        if (checked.summary.conflict > 0) return checked;
        for (const row of checked.rows) {
          if (row.status !== 'create') continue;
          const bindingId = randomUUID();
          await connection.query
            .insertInto('externalIdentities')
            .values({
              id: bindingId,
              providerIssuer: row.issuer,
              providerSubject: row.subject,
              localUserId: row.localUserId!,
              lastSyncedAt: now,
              lastSeenEnabled: true,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
          await this.audit.record(
            {
              action: 'identity.bind_employee_no',
              actorId,
              targetType: 'externalIdentity',
              targetId: bindingId,
              details: {
                issuer: row.issuer,
                subject: row.subject,
                employeeNo: row.employeeNo,
                localUserId: row.localUserId,
              },
            },
            connection,
          );
        }
        return checked;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw identityError(
        'ABORTED',
        'IDENTITY_BINDING_CONFLICTS',
        'A concurrent change conflicts with this batch; preview again.',
      );
    }
    if (preview.summary.conflict > 0) {
      throw identityError(
        'ABORTED',
        'IDENTITY_BINDING_CONFLICTS',
        'The batch has conflicts; nothing was written.',
        { report: preview },
      );
    }
    return preview;
  }

  private async findByUsername(
    connection: DatabaseConnection,
    employeeNo: string,
  ): Promise<readonly Record<string, unknown>[]> {
    return connection.query
      .selectFrom('user')
      .select(['id', 'username', 'disabledAt'])
      .where('username', '=', employeeNo)
      .where('deletedAt', 'is', null)
      .execute();
  }

  private async loadUser(
    connection: DatabaseConnection,
    localUserId: string,
  ): Promise<Record<string, unknown> | undefined> {
    return connection.query
      .selectFrom('user')
      .select(['id', 'username', 'disabledAt'])
      .where('id', '=', localUserId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }
}
