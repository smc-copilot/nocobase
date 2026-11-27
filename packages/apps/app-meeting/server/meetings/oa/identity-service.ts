import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import { requireMeetingAction, requireUser } from '../access.js';
import {
  MEETING_OA_DELEGATIONS,
  MEETING_OA_EMPLOYEE_MAPS,
  type MeetingOaDelegation,
  type MeetingOaEmployeeMap,
} from '../resources.js';
import type { MeetingOaAdapter, OaPerson } from './adapter.js';
import { MeetingOaError } from './errors.js';

export interface IdentityPublic {
  userId: string;
  employeeNo: string | null;
  displayName: string | null;
  status: string | null;
  canSync: boolean;
  denyReason: string | null;
}

export class MeetingOaIdentityService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly userId: string | undefined,
    private readonly adapter?: MeetingOaAdapter,
  ) {}

  async searchPeople(query: string): Promise<readonly OaPerson[]> {
    await requireMeetingAction(this.authz, 'oaDraftEdit');
    if (!this.adapter) {
      throw new MeetingOaError(
        'OA_NOT_CONFIGURED',
        'OA people search is not configured.',
        'FAILED_PRECONDITION',
      );
    }
    return this.adapter.searchPeople(query);
  }

  async current(): Promise<IdentityPublic> {
    const userId = requireUser(this.userId);
    const map = await this.activeMap(userId);
    return {
      userId,
      employeeNo: map?.employeeNo ?? null,
      displayName: map?.displayName ?? null,
      status: map?.status ?? null,
      canSync: Boolean(map),
      denyReason: map ? null : 'OA_MAPPING_MISSING',
    };
  }

  async listMaps(): Promise<readonly IdentityPublic[]> {
    await requireMeetingAction(this.authz, 'identityManage');
    const rows = await this.connection
      .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
      .findMany({ sort: (sort) => sort.field('createdAt').desc() });
    return rows.map((row) => ({
      userId: row.userId,
      employeeNo: row.employeeNo,
      displayName: row.displayName,
      status: row.status,
      canSync: row.status === 'active',
      denyReason: row.status === 'active' ? null : 'OA_MAPPING_MISSING',
    }));
  }

  async upsertMap(input: {
    userId: string;
    employeeNo: string;
    displayName?: string | null;
    status?: 'active' | 'revoked';
  }): Promise<IdentityPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    const actor = requireUser(this.userId);
    const employeeNo = input.employeeNo.trim();
    if (!employeeNo || employeeNo.toLowerCase() === 'root') {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'A trusted employee number is required; root is not a default OA employee.',
        'INVALID_ARGUMENT',
      );
    }
    const now = new Date();
    const existing = await this.connection
      .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
      .findOne({ filter: { userId: input.userId } });
    if (existing) {
      await this.connection
        .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
        .updateOne({
          filter: { id: existing.id },
          values: {
            employeeNo,
            displayName: input.displayName ?? existing.displayName,
            status: input.status ?? 'active',
            updatedAt: now,
          },
        });
    } else {
      await this.connection
        .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
        .createOne({
          values: {
            id: randomUUID(),
            userId: input.userId,
            employeeNo,
            displayName: input.displayName ?? null,
            status: input.status ?? 'active',
            createdBy: actor,
            createdAt: now,
            updatedAt: now,
          },
        });
    }
    return this.publicFor(input.userId);
  }

  async createDelegation(input: {
    principalUserId: string;
    delegateUserId: string;
  }): Promise<MeetingOaDelegation> {
    await requireMeetingAction(this.authz, 'identityManage');
    const actor = requireUser(this.userId);
    if (input.principalUserId === input.delegateUserId) {
      throw new MeetingOaError(
        'OA_DELEGATION_DENIED',
        'A person cannot be their own OA delegate.',
        'INVALID_ARGUMENT',
      );
    }
    const now = new Date();
    const existing = await this.connection
      .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
      .findOne({
        filter: {
          principalUserId: input.principalUserId,
          delegateUserId: input.delegateUserId,
        },
      });
    if (existing) {
      await this.connection
        .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
        .updateOne({
          filter: { id: existing.id },
          values: { status: 'active', updatedAt: now },
        });
      return (await this.connection
        .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
        .findOne({ filter: { id: existing.id } })) as MeetingOaDelegation;
    }
    const id = randomUUID();
    await this.connection
      .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
      .createOne({
        values: {
          id,
          principalUserId: input.principalUserId,
          delegateUserId: input.delegateUserId,
          status: 'active',
          createdBy: actor,
          createdAt: now,
          updatedAt: now,
        },
      });
    return (await this.connection
      .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
      .findOne({ filter: { id } })) as MeetingOaDelegation;
  }

  async resolveCreator(input: {
    asPrincipalUserId?: string;
  }): Promise<
    | { creatorUserId: string; creatorEmployeeNo: string }
    | { denyReason: string }
  > {
    const actor = requireUser(this.userId);
    const principalId = input.asPrincipalUserId?.trim() || actor;
    if (principalId !== actor) {
      const delegation = await this.connection
        .repository<MeetingOaDelegation>(MEETING_OA_DELEGATIONS)
        .findOne({
          filter: {
            principalUserId: principalId,
            delegateUserId: actor,
            status: 'active',
          },
        });
      if (!delegation) {
        return { denyReason: 'OA_DELEGATION_DENIED' };
      }
    }
    const map = await this.activeMap(principalId);
    if (!map) return { denyReason: 'OA_MAPPING_MISSING' };
    return { creatorUserId: principalId, creatorEmployeeNo: map.employeeNo };
  }

  async activeMap(userId: string): Promise<MeetingOaEmployeeMap | undefined> {
    const row = await this.connection
      .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
      .findOne({ filter: { userId } });
    if (!row || row.status !== 'active') return undefined;
    return row;
  }

  private async publicFor(userId: string): Promise<IdentityPublic> {
    const map = await this.connection
      .repository<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
      .findOne({ filter: { userId } });
    return {
      userId,
      employeeNo: map?.employeeNo ?? null,
      displayName: map?.displayName ?? null,
      status: map?.status ?? null,
      canSync: map?.status === 'active',
      denyReason: map?.status === 'active' ? null : 'OA_MAPPING_MISSING',
    };
  }
}
