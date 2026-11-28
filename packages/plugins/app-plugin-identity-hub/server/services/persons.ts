import {
  isUniqueConstraintViolation,
  type DatabaseConnection,
} from '@nocobase/db';

import { hubError } from '../errors.js';
import type { ActorContext, Page, PageQuery, PersonStatus } from '../model.js';
import { buildIdentityKey, isPersonStatus, pageWindow } from '../model.js';
import {
  blankToNull,
  iso,
  isoOrNull,
  readJson,
  str,
  strOrNull,
  toDate,
  toDateOrNull,
  toInt,
  writeJson,
} from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { IdentityAuditLog } from './audit.js';
import type { ConflictQueue } from './conflicts.js';

export interface ManualIdentityInput {
  readonly providerId: string;
  readonly subject: string;
  readonly externalId?: string | null;
  readonly externalUsername?: string | null;
  readonly issuer?: string | null;
}

export interface CreatePersonInput {
  readonly displayName: string;
  readonly employeeNo?: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
  readonly mobile?: string | null;
  readonly organizationId?: string | null;
  readonly departmentId?: string | null;
  readonly status?: PersonStatus;
  readonly sourceAuthority?: Record<string, unknown> | null;
  readonly manualIdentity?: ManualIdentityInput;
}

export interface UpdatePersonInput {
  readonly displayName?: string;
  readonly employeeNo?: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
  readonly mobile?: string | null;
  readonly organizationId?: string | null;
  readonly departmentId?: string | null;
  readonly sourceAuthority?: Record<string, unknown> | null;
}

export interface PersonView {
  readonly personId: string;
  readonly employeeNo: string | null;
  readonly username: string | null;
  readonly displayName: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly organizationId: string | null;
  readonly departmentId: string | null;
  readonly status: PersonStatus;
  readonly version: number;
  readonly sourceAuthority: Record<string, unknown> | null;
  readonly disabledAt: string | null;
  readonly manualIdentityId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PersonRow {
  readonly personId: string;
  readonly employeeNo: string | null;
  readonly username: string | null;
  readonly displayName: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly organizationId: string | null;
  readonly departmentId: string | null;
  readonly status: PersonStatus;
  readonly version: number;
  readonly sourceAuthority: Record<string, unknown> | null;
  readonly disabledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PersonService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
    private readonly conflicts: ConflictQueue,
  ) {}

  public async create(
    input: CreatePersonInput,
    actor?: ActorContext,
  ): Promise<PersonView> {
    const employeeNo = blankToNull(input.employeeNo);
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_DISPLAY_NAME_REQUIRED',
        'A person needs a display name.',
      );
    }
    if (employeeNo) {
      const existing = await this.findByEmployeeNo(employeeNo);
      if (existing) {
        await this.openEmployeeConflict(existing, input, employeeNo, actor);
      }
    }
    try {
      return await this.runtime.transaction(async (connection) => {
        const now = this.runtime.now();
        const personId = this.runtime.id();
        const status = input.status ?? 'active';
        if (!isPersonStatus(status)) {
          throw hubError(
            'INVALID_ARGUMENT',
            'IDENTITY_HUB_PERSON_STATUS_INVALID',
            'Person status is not recognized.',
          );
        }
        let manualIdentityId: string | null = null;
        if (input.manualIdentity) {
          await this.requireManualProvider(
            input.manualIdentity.providerId,
            connection,
          );
        }
        await connection.query
          .insertInto(tables.persons)
          .values({
            personId,
            employeeNo,
            username: blankToNull(input.username),
            displayName,
            email: blankToNull(input.email),
            mobile: blankToNull(input.mobile),
            organizationId: blankToNull(input.organizationId),
            departmentId: blankToNull(input.departmentId),
            status,
            version: 1,
            sourceAuthority: writeJson(input.sourceAuthority ?? null),
            disabledAt: status === 'disabled' ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        if (input.manualIdentity) {
          manualIdentityId = await this.insertManualIdentity(
            connection,
            personId,
            input.manualIdentity,
            now,
          );
        }
        const stored = await this.requireRow(personId, connection);
        await this.audit.append(
          {
            action: 'person.created',
            actorId: actor?.actorId,
            personId,
            requestId: actor?.requestId,
            entityType: 'person',
            entityId: personId,
            details: {
              status,
              employeeNo,
              manualIdentityId,
            },
          },
          connection,
        );
        return toPersonView(stored, manualIdentityId);
      });
    } catch (error) {
      if (employeeNo && isUniqueConstraintViolation(error)) {
        const existing = await this.findByEmployeeNo(employeeNo);
        if (existing) {
          await this.openEmployeeConflict(existing, input, employeeNo, actor);
        }
        throw hubError(
          'ALREADY_EXISTS',
          'IDENTITY_HUB_UNIQUE_CONFLICT',
          'A unique identity hub constraint was already taken.',
        );
      }
      throw error;
    }
  }

  public async get(personId: string): Promise<PersonView> {
    return toPersonView(await this.requireRow(personId), null);
  }

  public async list(
    query: PageQuery & { readonly status?: PersonStatus } = {},
  ): Promise<Page<PersonView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    let listed = connection.query.selectFrom(tables.persons).selectAll();
    let counted = connection.query
      .selectFrom(tables.persons)
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
      items: rows.map((row) =>
        toPersonView(toPersonRow(row as Record<string, unknown>), null),
      ),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public async update(
    personId: string,
    input: UpdatePersonInput,
    actor?: ActorContext,
  ): Promise<PersonView> {
    const current = await this.requireRow(personId);
    this.assertMutable(current);
    const employeeNo =
      input.employeeNo === undefined
        ? current.employeeNo
        : blankToNull(input.employeeNo);
    if (employeeNo && employeeNo !== current.employeeNo) {
      const existing = await this.findByEmployeeNo(employeeNo);
      if (existing && existing.personId !== personId) {
        await this.openEmployeeConflict(
          existing,
          { displayName: input.displayName ?? current.displayName },
          employeeNo,
          actor,
        );
      }
    }
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.persons)
        .set({
          employeeNo,
          username:
            input.username === undefined
              ? current.username
              : blankToNull(input.username),
          displayName: input.displayName?.trim() || current.displayName,
          email:
            input.email === undefined
              ? current.email
              : blankToNull(input.email),
          mobile:
            input.mobile === undefined
              ? current.mobile
              : blankToNull(input.mobile),
          organizationId:
            input.organizationId === undefined
              ? current.organizationId
              : blankToNull(input.organizationId),
          departmentId:
            input.departmentId === undefined
              ? current.departmentId
              : blankToNull(input.departmentId),
          sourceAuthority:
            input.sourceAuthority === undefined
              ? writeJson(current.sourceAuthority)
              : writeJson(input.sourceAuthority),
          version: current.version + 1,
          updatedAt: now,
        })
        .where('personId', '=', personId)
        .execute();
      const stored = await this.requireRow(personId, connection);
      await this.audit.append(
        {
          action: 'person.updated',
          actorId: actor?.actorId,
          personId,
          requestId: actor?.requestId,
          entityType: 'person',
          entityId: personId,
          details: { version: stored.version },
        },
        connection,
      );
      return toPersonView(stored, null);
    });
  }

  public disable(personId: string, actor?: ActorContext): Promise<PersonView> {
    return this.transition(personId, 'disabled', 'person.disabled', actor);
  }

  public enable(personId: string, actor?: ActorContext): Promise<PersonView> {
    return this.transition(personId, 'active', 'person.enabled', actor);
  }

  public archive(personId: string, actor?: ActorContext): Promise<PersonView> {
    return this.transition(personId, 'archived', 'person.archived', actor);
  }

  public async findByEmployeeNo(
    employeeNo: string,
    connection?: DatabaseConnection,
  ): Promise<PersonRow | undefined> {
    const row = await (connection ?? this.runtime.database.connection()).query
      .selectFrom(tables.persons)
      .selectAll()
      .where('employeeNo', '=', employeeNo)
      .executeTakeFirst();
    return row ? toPersonRow(row) : undefined;
  }

  public async findByEmail(email: string): Promise<PersonRow | undefined> {
    const needle = email.trim().toLowerCase();
    const rows = await this.runtime.database
      .connection()
      .query.selectFrom(tables.persons)
      .selectAll()
      .execute();
    return rows
      .map((row) => toPersonRow(row as Record<string, unknown>))
      .find((person) => person.email?.trim().toLowerCase() === needle);
  }

  private async transition(
    personId: string,
    status: PersonStatus,
    action: string,
    actor?: ActorContext,
  ): Promise<PersonView> {
    const current = await this.requireRow(personId);
    if (current.status === 'archived' && status !== 'archived') {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_PERSON_ARCHIVED',
        'An archived person cannot change status.',
      );
    }
    if (current.status === status) return toPersonView(current, null);
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.persons)
        .set({
          status,
          version: current.version + 1,
          disabledAt: status === 'disabled' ? now : null,
          updatedAt: now,
        })
        .where('personId', '=', personId)
        .execute();
      const stored = await this.requireRow(personId, connection);
      await this.audit.append(
        {
          action,
          actorId: actor?.actorId,
          personId,
          requestId: actor?.requestId,
          entityType: 'person',
          entityId: personId,
          details: { status, version: stored.version },
        },
        connection,
      );
      return toPersonView(stored, null);
    });
  }

  private async openEmployeeConflict(
    existing: PersonRow,
    input: { readonly displayName?: string },
    employeeNo: string,
    actor?: ActorContext,
  ): Promise<never> {
    const conflict = await this.conflicts.enqueue(
      {
        conflictType: 'duplicate-employee-no',
        personId: existing.personId,
        payload: {
          employeeNo,
          displayName: input.displayName ?? existing.displayName,
          existingPersonId: existing.personId,
        },
      },
      actor,
    );
    throw hubError(
      'ALREADY_EXISTS',
      'IDENTITY_HUB_DUPLICATE_EMPLOYEE_NO',
      'An employee number is already assigned.',
      { conflictId: conflict.conflictId, personId: existing.personId },
    );
  }

  private async requireManualProvider(
    providerId: string,
    connection: DatabaseConnection,
  ): Promise<void> {
    const row = await connection.query
      .selectFrom(tables.providers)
      .selectAll()
      .where('providerId', '=', providerId)
      .executeTakeFirst();
    const record = row;
    if (!record) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_PROVIDER_NOT_FOUND',
        'The manual identity provider was not found.',
      );
    }
    if (str(record.providerType) !== 'manual' || !truthy(record.enabled)) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_MANUAL_PROVIDER_REQUIRED',
        'A manual person identity requires an enabled manual provider.',
      );
    }
  }

  private async insertManualIdentity(
    connection: DatabaseConnection,
    personId: string,
    input: ManualIdentityInput,
    now: Date,
  ): Promise<string> {
    const identityId = this.runtime.id();
    const subject = input.subject.trim();
    if (!subject) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_SUBJECT_REQUIRED',
        'A manual identity needs a subject.',
      );
    }
    await connection.query
      .insertInto(tables.identities)
      .values({
        identityId,
        personId,
        providerId: input.providerId,
        providerType: 'manual',
        issuer: blankToNull(input.issuer),
        subject,
        externalId: blankToNull(input.externalId),
        externalUsername: blankToNull(input.externalUsername),
        identityKey: buildIdentityKey(input),
        status: 'active',
        verifiedAt: now,
        lastAuthenticatedAt: null,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return identityId;
  }

  private async requireRow(
    personId: string,
    connection?: DatabaseConnection,
  ): Promise<PersonRow> {
    const row = await (connection ?? this.runtime.database.connection()).query
      .selectFrom(tables.persons)
      .selectAll()
      .where('personId', '=', personId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_PERSON_NOT_FOUND',
        'The person was not found.',
      );
    }
    return toPersonRow(row);
  }

  private assertMutable(person: PersonRow): void {
    if (person.status === 'archived') {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_PERSON_ARCHIVED',
        'An archived person cannot be updated.',
      );
    }
  }
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toPersonRow(row: Record<string, unknown>): PersonRow {
  const status = str(row.status);
  return {
    personId: str(row.personId),
    employeeNo: strOrNull(row.employeeNo),
    username: strOrNull(row.username),
    displayName: str(row.displayName),
    email: strOrNull(row.email),
    mobile: strOrNull(row.mobile),
    organizationId: strOrNull(row.organizationId),
    departmentId: strOrNull(row.departmentId),
    status: isPersonStatus(status) ? status : 'pending',
    version: toInt(row.version),
    sourceAuthority: readJson<Record<string, unknown> | null>(
      row.sourceAuthority,
      null,
    ),
    disabledAt: toDateOrNull(row.disabledAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function toPersonView(
  row: PersonRow,
  manualIdentityId: string | null,
): PersonView {
  return {
    personId: row.personId,
    employeeNo: row.employeeNo,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    mobile: row.mobile,
    organizationId: row.organizationId,
    departmentId: row.departmentId,
    status: row.status,
    version: row.version,
    sourceAuthority: row.sourceAuthority,
    disabledAt: isoOrNull(row.disabledAt),
    manualIdentityId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
