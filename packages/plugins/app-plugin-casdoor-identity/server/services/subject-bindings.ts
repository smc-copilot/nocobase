import { randomUUID } from 'node:crypto';

import type { DatabaseConnection } from '@nocobase/db';

import { nowOf, type IdentityRuntime } from '../identity/model.js';
import {
  identityError,
  isUniqueViolation,
  str,
  strOrNull,
  toDate,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';

export interface SubjectBindingInput {
  readonly connectionId: string;
  readonly octopSubject: string;
  /** The `externalIdentities` row to bind, or name it by issuer and subject. */
  readonly externalIdentityId?: string;
  readonly issuer?: string;
  readonly subject?: string;
  /** Optional statement of who the subject belongs to; must agree with the identity's own user. */
  readonly localUserId?: string;
}

export type SubjectBindingConflict =
  | 'DUPLICATE_IN_BATCH'
  | 'EXTERNAL_IDENTITY_REQUIRED'
  | 'EXTERNAL_IDENTITY_NOT_FOUND'
  | 'SUBJECT_MISMATCH'
  | 'USER_UNAVAILABLE'
  | 'BINDING_CONFLICT'
  | 'LOCAL_USER_ALREADY_BOUND';

export interface SubjectBindingPreviewRow {
  readonly index: number;
  readonly connectionId: string;
  readonly octopSubject: string;
  readonly status: 'create' | 'unchanged' | 'conflict';
  readonly conflicts: readonly SubjectBindingConflict[];
  readonly localUserId?: string;
  readonly externalIdentityId?: string;
}

export interface SubjectBindingPreview {
  readonly rows: readonly SubjectBindingPreviewRow[];
  readonly summary: {
    readonly create: number;
    readonly unchanged: number;
    readonly conflict: number;
  };
}

export interface SubjectBindingRecord {
  readonly id: string;
  readonly connectionId: string;
  readonly octopSubject: string;
  readonly localUserId: string;
  readonly externalIdentityId: string;
  readonly status: string;
  /** Monotonic authorization version; tickets/embeds capture this, not the binding id. */
  readonly revision: number;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toBinding(row: Record<string, unknown>): SubjectBindingRecord {
  return {
    id: str(row.id),
    connectionId: str(row.connectionId),
    octopSubject: str(row.octopSubject),
    localUserId: str(row.localUserId),
    externalIdentityId: str(row.externalIdentityId),
    status: str(row.status),
    revision: Number(row.revision ?? 1),
    createdBy: strOrNull(row.createdBy),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

/**
 * Controlled pre-binding of Octop subjects to verified local identities.
 *
 * A binding is only ever created here, by an administrator, after a read-only preview. It is
 * never created as a side effect of an authenticated request, so a valid user token presented
 * with somebody else's Octop subject is refused instead of being bound.
 */
export class SubjectBindingService {
  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async list(
    options: { readonly connectionId?: string; readonly limit?: number } = {},
  ): Promise<readonly SubjectBindingRecord[]> {
    let query = this.runtime
      .database()
      .connection()
      .query.selectFrom('businessUiSubjectBindings')
      .selectAll();
    if (options.connectionId)
      query = query.where('connectionId', '=', options.connectionId);
    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(Math.min(options.limit ?? 50, 200))
      .execute();
    return rows.map((row: Record<string, unknown>) => toBinding(row));
  }

  /**
   * Read-only check of a batch: classifies each row as a new binding, an identical existing one,
   * or a conflict, without writing anything.
   */
  public async preview(
    rows: readonly SubjectBindingInput[],
    connection: DatabaseConnection = this.runtime.database().connection(),
  ): Promise<SubjectBindingPreview> {
    const seenKeys = new Set<string>();
    const seenUsers = new Map<string, string>();
    const results: SubjectBindingPreviewRow[] = [];

    for (const [index, input] of rows.entries()) {
      const conflicts: SubjectBindingConflict[] = [];
      const key = `${input.connectionId}\n${input.octopSubject}`;
      if (seenKeys.has(key)) conflicts.push('DUPLICATE_IN_BATCH');
      seenKeys.add(key);

      const identity = await this.findIdentity(connection, input);
      let localUserId: string | undefined;
      let externalIdentityId: string | undefined;
      if (identity === 'missing-reference') {
        conflicts.push('EXTERNAL_IDENTITY_REQUIRED');
      } else if (!identity) {
        conflicts.push('EXTERNAL_IDENTITY_NOT_FOUND');
      } else {
        localUserId = identity.localUserId;
        externalIdentityId = identity.id;
        if (
          input.localUserId !== undefined &&
          input.localUserId !== identity.localUserId
        ) {
          // SEC-02: a row may not attach an Octop subject to a user the identity does not belong to.
          conflicts.push('SUBJECT_MISMATCH');
        }
        const user = await connection.query
          .selectFrom('user')
          .select(['id', 'deletedAt'])
          .where('id', '=', identity.localUserId)
          .executeTakeFirst();
        if (!user || user.deletedAt != null) conflicts.push('USER_UNAVAILABLE');
      }

      let status: SubjectBindingPreviewRow['status'] = 'create';
      if (localUserId && externalIdentityId && conflicts.length === 0) {
        const existing = await connection.query
          .selectFrom('businessUiSubjectBindings')
          .selectAll()
          .where('connectionId', '=', input.connectionId)
          .where('octopSubject', '=', input.octopSubject)
          .executeTakeFirst();
        if (existing) {
          if (
            str(existing.externalIdentityId) === externalIdentityId &&
            str(existing.localUserId) === localUserId
          ) {
            status = 'unchanged';
          } else {
            conflicts.push('BINDING_CONFLICT');
          }
        } else {
          const userKey = `${input.connectionId}\n${localUserId}`;
          const otherInBatch = seenUsers.get(userKey);
          const boundElsewhere = await connection.query
            .selectFrom('businessUiSubjectBindings')
            .select('octopSubject')
            .where('connectionId', '=', input.connectionId)
            .where('localUserId', '=', localUserId)
            .where('status', '=', 'active')
            .executeTakeFirst();
          if (
            (otherInBatch && otherInBatch !== input.octopSubject) ||
            boundElsewhere
          ) {
            conflicts.push('LOCAL_USER_ALREADY_BOUND');
          }
          seenUsers.set(userKey, input.octopSubject);
        }
      }
      if (conflicts.length > 0) status = 'conflict';
      results.push({
        index,
        connectionId: input.connectionId,
        octopSubject: input.octopSubject,
        status,
        conflicts,
        ...(localUserId ? { localUserId } : {}),
        ...(externalIdentityId ? { externalIdentityId } : {}),
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

  /**
   * Writes a previewed batch atomically. The batch is re-checked inside the transaction and any
   * conflict aborts the whole commit, reporting every row's outcome.
   */
  public async commit(
    rows: readonly SubjectBindingInput[],
    actorId: string | null,
  ): Promise<SubjectBindingPreview> {
    const database = this.runtime.database();
    const now = nowOf(this.runtime);
    let preview: SubjectBindingPreview | undefined;
    try {
      preview = await database.transaction(async (connection) => {
        const checked = await this.preview(rows, connection);
        if (checked.summary.conflict > 0) return checked;
        for (const row of checked.rows) {
          if (row.status !== 'create') continue;
          const bindingId = randomUUID();
          await connection.query
            .insertInto('businessUiSubjectBindings')
            .values({
              id: bindingId,
              connectionId: row.connectionId,
              octopSubject: row.octopSubject,
              localUserId: row.localUserId!,
              externalIdentityId: row.externalIdentityId!,
              status: 'active',
              revision: 1,
              activeLocalUserId: row.localUserId!,
              createdBy: actorId,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
          await this.audit.record(
            {
              action: 'subjectBinding.create',
              actorId,
              targetType: 'subjectBinding',
              targetId: bindingId,
              details: {
                connectionId: row.connectionId,
                octopSubject: row.octopSubject,
                localUserId: row.localUserId,
                externalIdentityId: row.externalIdentityId,
              },
            },
            connection,
          );
        }
        return checked;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent commit won the unique index between the check and the insert.
      throw identityError(
        'ABORTED',
        'SUBJECT_BINDING_CONFLICTS',
        'A concurrent change conflicts with this batch; preview again.',
      );
    }
    if (preview.summary.conflict > 0) {
      throw identityError(
        'ABORTED',
        'SUBJECT_BINDING_CONFLICTS',
        'The batch has conflicts; nothing was written.',
        { report: preview },
      );
    }
    return preview;
  }

  /**
   * Revokes an active binding and bumps its revision so outstanding tickets and
   * embeds that captured the previous revision cannot be reused (NEXT-03).
   */
  public async revoke(
    bindingId: string,
    actorId: string | null,
  ): Promise<SubjectBindingRecord> {
    return this.setStatus(
      bindingId,
      'revoked',
      actorId,
      'subjectBinding.revoke',
    );
  }

  /**
   * Re-enables a revoked binding with a new revision. Old tickets/embeds stay invalid.
   */
  public async reEnable(
    bindingId: string,
    actorId: string | null,
  ): Promise<SubjectBindingRecord> {
    return this.setStatus(
      bindingId,
      'active',
      actorId,
      'subjectBinding.reEnable',
    );
  }

  private async setStatus(
    bindingId: string,
    status: 'active' | 'revoked',
    actorId: string | null,
    action: string,
  ): Promise<SubjectBindingRecord> {
    const database = this.runtime.database();
    const now = nowOf(this.runtime);
    return database.transaction(async (connection) => {
      const row = await connection.query
        .selectFrom('businessUiSubjectBindings')
        .selectAll()
        .where('id', '=', bindingId)
        .executeTakeFirst();
      if (!row) {
        throw identityError(
          'NOT_FOUND',
          'SUBJECT_BINDING_NOT_FOUND',
          'Subject binding not found.',
        );
      }
      const current = toBinding(row);
      const nextRevision = current.revision + 1;
      await connection.query
        .updateTable('businessUiSubjectBindings')
        .set({
          status,
          revision: nextRevision,
          // Occupancy column: set while active so the unique index enforces N25;
          // clear on revoke so a later rebind of another subject can succeed.
          activeLocalUserId: status === 'active' ? current.localUserId : null,
          updatedAt: now,
        })
        .where('id', '=', bindingId)
        .execute();
      await this.audit.record(
        {
          action,
          actorId,
          targetType: 'subjectBinding',
          targetId: bindingId,
          details: {
            previousStatus: current.status,
            status,
            previousRevision: current.revision,
            revision: nextRevision,
            connectionId: current.connectionId,
          },
        },
        connection,
      );
      return {
        ...current,
        status,
        revision: nextRevision,
        updatedAt: now,
      };
    });
  }

  /**
   * The authorization check Business UI routes use: the authenticated local user must be the
   * one the Octop subject was pre-bound to. It only reads; it never creates or repairs a binding.
   */
  public async assertSubjectOwnedBy(input: {
    readonly connectionId: string;
    readonly octopSubject: string;
    readonly authenticatedUserId: string;
  }): Promise<SubjectBindingRecord> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('businessUiSubjectBindings')
      .selectAll()
      .where('connectionId', '=', input.connectionId)
      .where('octopSubject', '=', input.octopSubject)
      .executeTakeFirst();
    if (!row) {
      throw identityError(
        'PERMISSION_DENIED',
        'SUBJECT_BINDING_REQUIRED',
        'The Octop subject has no binding.',
      );
    }
    const binding = toBinding(row);
    if (binding.status !== 'active') {
      throw identityError(
        'PERMISSION_DENIED',
        'SUBJECT_BINDING_REVOKED',
        'The Octop subject binding is not active.',
      );
    }
    if (binding.localUserId !== input.authenticatedUserId) {
      throw identityError(
        'PERMISSION_DENIED',
        'SUBJECT_MISMATCH',
        'The Octop subject belongs to another user.',
      );
    }
    return binding;
  }

  private async findIdentity(
    connection: DatabaseConnection,
    input: SubjectBindingInput,
  ): Promise<
    { id: string; localUserId: string } | 'missing-reference' | undefined
  > {
    let query = connection.query
      .selectFrom('externalIdentities')
      .select(['id', 'localUserId']);
    if (input.externalIdentityId) {
      query = query.where('id', '=', input.externalIdentityId);
    } else if (input.issuer && input.subject) {
      query = query
        .where('providerIssuer', '=', input.issuer)
        .where('providerSubject', '=', input.subject);
    } else {
      return 'missing-reference';
    }
    const row = await query.executeTakeFirst();
    return row
      ? { id: str(row.id), localUserId: str(row.localUserId) }
      : undefined;
  }
}
