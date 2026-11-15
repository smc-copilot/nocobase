import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';
import { MEETING_RESOURCE, MEETINGS, type Meeting } from './resources.js';

export interface MeetingListQuery {
  page: number;
  pageSize: number;
}

export interface MeetingPublic {
  id: string;
  title: string | null;
  meetingCode: string | null;
  createdAt: string;
}

function meetingsForbidden(): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: 'meetings',
    message: 'This meeting is unavailable.',
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toPublic(row: Partial<Meeting>): MeetingPublic {
  if (!row.id || row.createdAt === undefined) throw meetingsForbidden();
  return {
    id: row.id,
    title: row.title ?? null,
    meetingCode: row.meetingCode ?? null,
    createdAt: toIso(row.createdAt),
  };
}

export class MeetingQueryService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
  ) {}

  private async readPolicy(): Promise<RepositoryPolicy> {
    const decision = await this.authz.authorize({
      resource: { type: 'composite', id: MEETING_RESOURCE },
      action: 'read',
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      throw meetingsForbidden();
    const policy = decision.conditions.database[MEETINGS];
    if (!policy?.read) throw meetingsForbidden();
    return policy;
  }

  private async meetings() {
    const policy = await this.readPolicy();
    return this.connection.repository<Meeting>(MEETINGS).withPolicy(policy);
  }

  async list(query: MeetingListQuery) {
    const repository = await this.meetings();
    const [rows, total] = await Promise.all([
      repository.findMany({
        sort: (sort) => sort.field('createdAt').desc(),
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      }),
      repository.count(),
    ]);
    return {
      data: rows.map(toPublic),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<MeetingPublic> {
    const row = await (await this.meetings()).findOne({ filter: { id } });
    if (!row) throw meetingsForbidden();
    return toPublic(row);
  }
}
