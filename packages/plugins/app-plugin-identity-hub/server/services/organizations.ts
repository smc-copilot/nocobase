import type { DatabaseConnection } from '@nocobase/db';

import type { ActorContext, Page, PageQuery, RecordStatus } from '../model.js';
import { isRecordStatus, pageWindow } from '../model.js';
import { hubError } from '../errors.js';
import { blankToNull, iso, str, toDate } from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { IdentityAuditLog } from './audit.js';

export interface OrganizationInput {
  readonly displayName: string;
  readonly parentId?: string | null;
  readonly status?: RecordStatus;
}

export interface OrganizationView {
  readonly organizationId: string;
  readonly displayName: string;
  readonly parentId: string | null;
  readonly status: RecordStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DepartmentInput {
  readonly organizationId: string;
  readonly displayName: string;
  readonly parentId?: string | null;
  readonly status?: RecordStatus;
}

export interface DepartmentView {
  readonly departmentId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly parentId: string | null;
  readonly status: RecordStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class OrganizationService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async createOrganization(
    input: OrganizationInput,
    actor?: ActorContext,
  ): Promise<OrganizationView> {
    if (input.parentId) await this.getOrganization(input.parentId);
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      const organizationId = this.runtime.id();
      await connection.query
        .insertInto(tables.organizations)
        .values({
          organizationId,
          displayName: input.displayName.trim(),
          parentId: blankToNull(input.parentId),
          status: input.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await this.audit.append(
        {
          action: 'organization.created',
          actorId: actor?.actorId,
          requestId: actor?.requestId,
          entityType: 'organization',
          entityId: organizationId,
          details: { displayName: input.displayName.trim() },
        },
        connection,
      );
      return this.getOrganization(organizationId, connection);
    });
  }

  public async updateOrganization(
    organizationId: string,
    input: Partial<OrganizationInput>,
    actor?: ActorContext,
  ): Promise<OrganizationView> {
    const current = await this.getOrganization(organizationId);
    if (input.parentId) await this.getOrganization(input.parentId);
    return this.runtime.transaction(async (connection) => {
      await connection.query
        .updateTable(tables.organizations)
        .set({
          displayName: input.displayName?.trim() || current.displayName,
          parentId:
            input.parentId === undefined
              ? current.parentId
              : blankToNull(input.parentId),
          status: input.status ?? current.status,
          updatedAt: this.runtime.now(),
        })
        .where('organizationId', '=', organizationId)
        .execute();
      await this.audit.append(
        {
          action: 'organization.updated',
          actorId: actor?.actorId,
          requestId: actor?.requestId,
          entityType: 'organization',
          entityId: organizationId,
          details: { displayName: input.displayName ?? current.displayName },
        },
        connection,
      );
      return this.getOrganization(organizationId, connection);
    });
  }

  public async listOrganizations(
    query: PageQuery = {},
  ): Promise<Page<OrganizationView>> {
    return listPage(
      this.runtime,
      tables.organizations,
      query,
      (row: Record<string, unknown>) => toOrganization(row),
    );
  }

  public async getOrganization(
    organizationId: string,
    connection: DatabaseConnection = this.runtime.database.connection(),
  ): Promise<OrganizationView> {
    const row = await connection.query
      .selectFrom(tables.organizations)
      .selectAll()
      .where('organizationId', '=', organizationId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_ORGANIZATION_NOT_FOUND',
        'The organization was not found.',
      );
    }
    return toOrganization(row);
  }

  public async createDepartment(
    input: DepartmentInput,
    actor?: ActorContext,
  ): Promise<DepartmentView> {
    await this.getOrganization(input.organizationId);
    if (input.parentId) await this.getDepartment(input.parentId);
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      const departmentId = this.runtime.id();
      await connection.query
        .insertInto(tables.departments)
        .values({
          departmentId,
          organizationId: input.organizationId,
          displayName: input.displayName.trim(),
          parentId: blankToNull(input.parentId),
          status: input.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await this.audit.append(
        {
          action: 'department.created',
          actorId: actor?.actorId,
          requestId: actor?.requestId,
          entityType: 'department',
          entityId: departmentId,
          details: { organizationId: input.organizationId },
        },
        connection,
      );
      return this.getDepartment(departmentId, connection);
    });
  }

  public async updateDepartment(
    departmentId: string,
    input: Partial<DepartmentInput>,
    actor?: ActorContext,
  ): Promise<DepartmentView> {
    const current = await this.getDepartment(departmentId);
    if (input.organizationId) await this.getOrganization(input.organizationId);
    if (input.parentId) await this.getDepartment(input.parentId);
    return this.runtime.transaction(async (connection) => {
      await connection.query
        .updateTable(tables.departments)
        .set({
          organizationId: input.organizationId ?? current.organizationId,
          displayName: input.displayName?.trim() || current.displayName,
          parentId:
            input.parentId === undefined
              ? current.parentId
              : blankToNull(input.parentId),
          status: input.status ?? current.status,
          updatedAt: this.runtime.now(),
        })
        .where('departmentId', '=', departmentId)
        .execute();
      await this.audit.append(
        {
          action: 'department.updated',
          actorId: actor?.actorId,
          requestId: actor?.requestId,
          entityType: 'department',
          entityId: departmentId,
          details: {
            organizationId: input.organizationId ?? current.organizationId,
          },
        },
        connection,
      );
      return this.getDepartment(departmentId, connection);
    });
  }

  public async listDepartments(
    query: PageQuery & { readonly organizationId?: string } = {},
  ): Promise<Page<DepartmentView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    let listed = connection.query.selectFrom(tables.departments).selectAll();
    let counted = connection.query
      .selectFrom(tables.departments)
      .select(({ fn }) => [fn.countAll().as('total')]);
    if (query.organizationId) {
      listed = listed.where('organizationId', '=', query.organizationId);
      counted = counted.where('organizationId', '=', query.organizationId);
    }
    const [rows, countRow] = await Promise.all([
      listed
        .orderBy('displayName', 'asc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      counted.executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toDepartment(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public async getDepartment(
    departmentId: string,
    connection: DatabaseConnection = this.runtime.database.connection(),
  ): Promise<DepartmentView> {
    const row = await connection.query
      .selectFrom(tables.departments)
      .selectAll()
      .where('departmentId', '=', departmentId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_DEPARTMENT_NOT_FOUND',
        'The department was not found.',
      );
    }
    return toDepartment(row);
  }
}

async function listPage<T>(
  runtime: HubRuntime,
  table: string,
  query: PageQuery,
  map: (row: Record<string, unknown>) => T,
): Promise<Page<T>> {
  const window = pageWindow(query);
  const connection = runtime.database.connection();
  const [rows, countRow] = await Promise.all([
    connection.query
      .selectFrom(table)
      .selectAll()
      .orderBy('displayName', 'asc')
      .limit(window.pageSize)
      .offset(window.offset)
      .execute(),
    connection.query
      .selectFrom(table)
      .select(({ fn }) => [fn.countAll().as('total')])
      .executeTakeFirst(),
  ]);
  return {
    items: rows.map((row) => map(row as Record<string, unknown>)),
    total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
    page: window.page,
    pageSize: window.pageSize,
  };
}

function toOrganization(row: Record<string, unknown>): OrganizationView {
  const status = str(row.status);
  return {
    organizationId: str(row.organizationId),
    displayName: str(row.displayName),
    parentId: row.parentId == null ? null : str(row.parentId),
    status: isRecordStatus(status) ? status : 'active',
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}

function toDepartment(row: Record<string, unknown>): DepartmentView {
  const status = str(row.status);
  return {
    departmentId: str(row.departmentId),
    organizationId: str(row.organizationId),
    displayName: str(row.displayName),
    parentId: row.parentId == null ? null : str(row.parentId),
    status: isRecordStatus(status) ? status : 'active',
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}
