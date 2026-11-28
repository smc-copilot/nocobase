import { isUniqueConstraintViolation } from '@nocobase/db';

import { hubError } from '../errors.js';
import type {
  ActorContext,
  MembershipStatus,
  Page,
  PageQuery,
  RecordStatus,
} from '../model.js';
import { isMembershipStatus, isRecordStatus, pageWindow } from '../model.js';
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
import type { PersonService } from './persons.js';

export interface AppInput {
  readonly appId: string;
  readonly displayName: string;
  readonly environment?: string;
  readonly oidcClientId?: string | null;
  readonly issuer?: string | null;
  readonly redirectUris?: readonly string[] | null;
  readonly postLogoutRedirectUris?: readonly string[] | null;
  readonly status?: RecordStatus;
  readonly owner?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface AppView {
  readonly appId: string;
  readonly displayName: string;
  readonly environment: string;
  readonly oidcClientId: string | null;
  readonly issuer: string | null;
  readonly redirectUris: readonly string[];
  readonly postLogoutRedirectUris: readonly string[];
  readonly status: RecordStatus;
  readonly owner: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GrantMembershipInput {
  readonly personId: string;
  readonly appId: string;
  readonly status?: 'invited' | 'active';
  readonly source?: string;
  readonly validFrom?: string | null;
  readonly validTo?: string | null;
  readonly reason?: string | null;
}

export interface MembershipView {
  readonly membershipId: string;
  readonly personId: string;
  readonly appId: string;
  readonly status: MembershipStatus;
  readonly source: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly revision: number;
  readonly reason: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class AppRegistryService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async register(
    input: AppInput,
    actor?: ActorContext,
  ): Promise<AppView> {
    const appId = input.appId.trim();
    if (!appId) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_APP_ID_REQUIRED',
        'An application needs an id.',
      );
    }
    try {
      return await this.runtime.transaction(async (connection) => {
        const now = this.runtime.now();
        await connection.query
          .insertInto(tables.apps)
          .values({
            appId,
            displayName: input.displayName.trim(),
            environment: blankToNull(input.environment) ?? 'production',
            oidcClientId: blankToNull(input.oidcClientId),
            issuer: blankToNull(input.issuer),
            redirectUris: writeJson(input.redirectUris ?? []),
            postLogoutRedirectUris: writeJson(
              input.postLogoutRedirectUris ?? [],
            ),
            status: input.status ?? 'active',
            owner: blankToNull(input.owner),
            metadata: writeJson(input.metadata ?? null),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await this.audit.append(
          {
            action: 'app.registered',
            actorId: actor?.actorId,
            appId,
            requestId: actor?.requestId,
            entityType: 'app',
            entityId: appId,
            details: { environment: input.environment ?? 'production' },
          },
          connection,
        );
        return this.require(appId, connection);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw hubError(
          'ALREADY_EXISTS',
          'IDENTITY_HUB_APP_EXISTS',
          'An application with this id already exists.',
        );
      }
      throw error;
    }
  }

  public async update(
    appId: string,
    input: Partial<Omit<AppInput, 'appId'>>,
    actor?: ActorContext,
  ): Promise<AppView> {
    const current = await this.require(appId);
    return this.runtime.transaction(async (connection) => {
      await connection.query
        .updateTable(tables.apps)
        .set({
          displayName: input.displayName?.trim() || current.displayName,
          environment: input.environment?.trim() || current.environment,
          oidcClientId:
            input.oidcClientId === undefined
              ? current.oidcClientId
              : blankToNull(input.oidcClientId),
          issuer:
            input.issuer === undefined
              ? current.issuer
              : blankToNull(input.issuer),
          redirectUris:
            input.redirectUris === undefined
              ? writeJson(current.redirectUris)
              : writeJson(input.redirectUris ?? []),
          postLogoutRedirectUris:
            input.postLogoutRedirectUris === undefined
              ? writeJson(current.postLogoutRedirectUris)
              : writeJson(input.postLogoutRedirectUris ?? []),
          status: input.status ?? current.status,
          owner:
            input.owner === undefined
              ? current.owner
              : blankToNull(input.owner),
          metadata:
            input.metadata === undefined
              ? writeJson(current.metadata)
              : writeJson(input.metadata),
          updatedAt: this.runtime.now(),
        })
        .where('appId', '=', appId)
        .execute();
      await this.audit.append(
        {
          action: 'app.updated',
          actorId: actor?.actorId,
          appId,
          requestId: actor?.requestId,
          entityType: 'app',
          entityId: appId,
          details: { displayName: input.displayName ?? current.displayName },
        },
        connection,
      );
      return this.require(appId, connection);
    });
  }

  public async list(query: PageQuery = {}): Promise<Page<AppView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    const [rows, countRow] = await Promise.all([
      connection.query
        .selectFrom(tables.apps)
        .selectAll()
        .orderBy('appId', 'asc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      connection.query
        .selectFrom(tables.apps)
        .select(({ fn }) => [fn.countAll().as('total')])
        .executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toApp(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public get(appId: string): Promise<AppView> {
    return this.require(appId);
  }

  private async require(
    appId: string,
    connection = this.runtime.database.connection(),
  ): Promise<AppView> {
    const row = await connection.query
      .selectFrom(tables.apps)
      .selectAll()
      .where('appId', '=', appId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_APP_NOT_FOUND',
        'The application was not found.',
      );
    }
    return toApp(row);
  }
}

export class MembershipService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
    private readonly persons: PersonService,
    private readonly apps: AppRegistryService,
  ) {}

  public async grant(
    input: GrantMembershipInput,
    actor?: ActorContext,
  ): Promise<MembershipView> {
    const person = await this.persons.get(input.personId);
    if (person.status === 'disabled' || person.status === 'archived') {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_PERSON_NOT_ACTIVE',
        'A disabled or archived person cannot be granted an application membership.',
      );
    }
    await this.apps.get(input.appId);
    const existing = await this.find(input.personId, input.appId);
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      const status = input.status ?? 'active';
      if (
        existing &&
        existing.status !== 'revoked' &&
        existing.status === status
      ) {
        return existing;
      }
      const membershipId = existing?.membershipId ?? this.runtime.id();
      const revision = existing ? existing.revision + 1 : 1;
      if (existing) {
        await connection.query
          .updateTable(tables.memberships)
          .set({
            status,
            source: input.source ?? existing.source,
            validFrom: input.validFrom ? new Date(input.validFrom) : null,
            validTo: input.validTo ? new Date(input.validTo) : null,
            revision,
            reason: blankToNull(input.reason),
            updatedBy: actor?.actorId ?? null,
            updatedAt: now,
          })
          .where('membershipId', '=', membershipId)
          .execute();
      } else {
        await connection.query
          .insertInto(tables.memberships)
          .values({
            membershipId,
            personId: input.personId,
            appId: input.appId,
            status,
            source: blankToNull(input.source) ?? 'manual',
            validFrom: input.validFrom ? new Date(input.validFrom) : null,
            validTo: input.validTo ? new Date(input.validTo) : null,
            revision,
            reason: blankToNull(input.reason),
            createdBy: actor?.actorId ?? null,
            updatedBy: actor?.actorId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
      await this.audit.append(
        {
          action: 'membership.granted',
          actorId: actor?.actorId,
          personId: input.personId,
          appId: input.appId,
          requestId: actor?.requestId,
          entityType: 'membership',
          entityId: membershipId,
          details: { status, revision, appId: input.appId },
        },
        connection,
      );
      return this.require(membershipId, connection);
    });
  }

  public async revoke(
    input: {
      readonly appId: string;
      readonly personId: string;
      readonly reason?: string | null;
    },
    actor?: ActorContext,
  ): Promise<MembershipView> {
    const current = await this.find(input.personId, input.appId);
    if (!current) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_MEMBERSHIP_NOT_FOUND',
        'The membership was not found.',
      );
    }
    if (current.status === 'revoked') return current;
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.memberships)
        .set({
          status: 'revoked',
          revision: current.revision + 1,
          reason: blankToNull(input.reason) ?? current.reason,
          updatedBy: actor?.actorId ?? null,
          updatedAt: now,
        })
        .where('membershipId', '=', current.membershipId)
        .execute();
      await this.audit.append(
        {
          action: 'membership.revoked',
          actorId: actor?.actorId,
          personId: input.personId,
          appId: input.appId,
          requestId: actor?.requestId,
          entityType: 'membership',
          entityId: current.membershipId,
          details: { appId: input.appId, revision: current.revision + 1 },
        },
        connection,
      );
      return this.require(current.membershipId, connection);
    });
  }

  public async list(
    appId: string,
    query: PageQuery = {},
  ): Promise<Page<MembershipView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    const [rows, countRow] = await Promise.all([
      connection.query
        .selectFrom(tables.memberships)
        .selectAll()
        .where('appId', '=', appId)
        .orderBy('createdAt', 'desc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      connection.query
        .selectFrom(tables.memberships)
        .select(({ fn }) => [fn.countAll().as('total')])
        .where('appId', '=', appId)
        .executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toMembership(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public async find(
    personId: string,
    appId: string,
  ): Promise<MembershipView | undefined> {
    const row = await this.runtime.database
      .connection()
      .query.selectFrom(tables.memberships)
      .selectAll()
      .where('personId', '=', personId)
      .where('appId', '=', appId)
      .executeTakeFirst();
    return row ? toMembership(row) : undefined;
  }

  private async require(
    membershipId: string,
    connection = this.runtime.database.connection(),
  ): Promise<MembershipView> {
    const row = await connection.query
      .selectFrom(tables.memberships)
      .selectAll()
      .where('membershipId', '=', membershipId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_MEMBERSHIP_NOT_FOUND',
        'The membership was not found.',
      );
    }
    return toMembership(row);
  }
}

function toApp(row: Record<string, unknown>): AppView {
  const status = str(row.status);
  return {
    appId: str(row.appId),
    displayName: str(row.displayName),
    environment: str(row.environment),
    oidcClientId: strOrNull(row.oidcClientId),
    issuer: strOrNull(row.issuer),
    redirectUris: readJson<string[]>(row.redirectUris, []),
    postLogoutRedirectUris: readJson<string[]>(row.postLogoutRedirectUris, []),
    status: isRecordStatus(status) ? status : 'active',
    owner: strOrNull(row.owner),
    metadata: readJson<Record<string, unknown> | null>(row.metadata, null),
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}

function toMembership(row: Record<string, unknown>): MembershipView {
  const status = str(row.status);
  return {
    membershipId: str(row.membershipId),
    personId: str(row.personId),
    appId: str(row.appId),
    status: isMembershipStatus(status) ? status : 'invited',
    source: str(row.source),
    validFrom: isoOrNull(toDateOrNull(row.validFrom)),
    validTo: isoOrNull(toDateOrNull(row.validTo)),
    revision: toInt(row.revision),
    reason: strOrNull(row.reason),
    createdBy: strOrNull(row.createdBy),
    updatedBy: strOrNull(row.updatedBy),
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}
