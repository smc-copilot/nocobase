import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import type { MeetingGatewayConfig } from '../config/meeting-gateway.js';
import type {
  GatewayMeetingRecord,
  MeetingGatewayAdapter,
} from './gateway/adapter.js';
import { MeetingGatewayError } from './gateway/errors.js';
import { withReadonlyRetry } from './gateway/pagination.js';
import { MeetingGatewayService } from './gateway-service.js';
import {
  MEETING_ACCESS,
  MEETING_PARTICIPANTS,
  MEETING_QUERY_RUNS,
  MEETING_RECORDINGS,
  MEETING_RESOURCE,
  MEETINGS,
  type FetchStatus,
  type Meeting,
  type MeetingAccess,
  type MeetingParticipant,
  type MeetingQueryRun,
  type MeetingRecording,
} from './resources.js';

const MAX_QUERY_DAYS = 93;

export interface QueryRunPublic {
  id: string;
  status: MeetingQueryRun['status'];
  startedAt: string;
  endedAt: string;
  errorReason: string | null;
  meetingCount: number | null;
  finishedAt: string | null;
  createdAt: string;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function requireUser(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: 'meetings',
      message: 'Sign in to query meetings.',
    });
  }
  return userId;
}

/** Inclusive calendar days in Asia/Shanghai, matching the list’s Beijing date inputs. */
export function inclusiveQueryDays(startedAt: Date, endedAt: Date): number {
  const dayStamp = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  const start = Date.parse(`${dayStamp(startedAt)}T00:00:00+08:00`);
  const end = Date.parse(`${dayStamp(endedAt)}T00:00:00+08:00`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function beijingQuarterWindow(now = new Date()): {
  startedAt: string;
  endedAt: string;
} {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [yearText, monthText] = stamp.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const quarterEndMonth = quarterStartMonth + 2;
  const lastDay = new Date(Date.UTC(year, quarterEndMonth, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    startedAt: new Date(
      `${year}-${pad(quarterStartMonth)}-01T00:00:00+08:00`,
    ).toISOString(),
    endedAt: new Date(
      `${year}-${pad(quarterEndMonth)}-${pad(lastDay)}T23:59:59.999+08:00`,
    ).toISOString(),
  };
}

function parseWindow(startedAt: string, endedAt: string, maxDays: number) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    throw new MeetingGatewayError(
      'QUERY_WINDOW_INVALID',
      'The query window is invalid.',
      'INVALID_ARGUMENT',
    );
  }
  const days = inclusiveQueryDays(start, end);
  if (days > Math.min(maxDays || MAX_QUERY_DAYS, MAX_QUERY_DAYS)) {
    throw new MeetingGatewayError(
      'QUERY_WINDOW_INVALID',
      `The query window cannot exceed ${MAX_QUERY_DAYS} days.`,
      'INVALID_ARGUMENT',
    );
  }
  return { start, end };
}

export class MeetingQueryRunService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly gateway: MeetingGatewayService,
    private readonly adapter: MeetingGatewayAdapter,
    private readonly config: MeetingGatewayConfig,
    private readonly userId: string | undefined,
    private readonly sleep?: (ms: number) => Promise<void>,
  ) {}

  private async requireQuery(): Promise<void> {
    const decision = await this.authz.authorize({
      resource: { type: 'composite', id: MEETING_RESOURCE },
      action: 'query',
    });
    if (decision.effect === 'deny') {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: 'meetings',
        message: 'Meeting query is unavailable.',
      });
    }
  }

  private toPublic(row: MeetingQueryRun): QueryRunPublic {
    return {
      id: row.id,
      status: row.status,
      startedAt: toIso(row.startedAt) as string,
      endedAt: toIso(row.endedAt) as string,
      errorReason: row.errorReason,
      meetingCount: row.meetingCount,
      finishedAt: toIso(row.finishedAt),
      createdAt: toIso(row.createdAt) as string,
    };
  }

  async get(id: string): Promise<QueryRunPublic> {
    const decision = await this.authz.authorize({
      resource: { type: 'composite', id: MEETING_RESOURCE },
      action: 'query',
    });
    if (decision.effect === 'deny' || !decision.conditions?.database) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: 'meetings',
        message: 'This query run is unavailable.',
      });
    }
    const policy = decision.conditions.database[MEETING_QUERY_RUNS];
    if (!policy?.read) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: 'meetings',
        message: 'This query run is unavailable.',
      });
    }
    requireUser(this.userId);
    const row = await this.connection
      .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
      .withPolicy(policy)
      .findOne({
        filter: buildFilter((filter) => filter.string('id').eq(id)),
      });
    if (
      !row?.id ||
      !row.status ||
      !row.startedAt ||
      !row.endedAt ||
      !row.createdAt
    ) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: 'meetings',
        message: 'This query run is unavailable.',
      });
    }
    return this.toPublic(row as MeetingQueryRun);
  }

  async start(input: {
    startedAt: string;
    endedAt: string;
  }): Promise<QueryRunPublic> {
    await this.requireQuery();
    const userId = requireUser(this.userId);
    const window = parseWindow(
      input.startedAt,
      input.endedAt,
      this.config.queryMaxDays,
    );
    const binding = await this.gateway.requireActiveBinding();
    const running = (
      await this.connection
        .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
        .findMany({
          filter: { userId, bindingId: binding.id, status: 'running' },
        })
    )[0];
    if (running) {
      throw new MeetingGatewayError(
        'QUERY_IN_PROGRESS',
        'A meeting query is already running for this connection.',
        'ALREADY_EXISTS',
      );
    }
    const now = new Date();
    const runId = randomUUID();
    await this.connection
      .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
      .createOne({
        values: {
          id: runId,
          userId,
          bindingId: binding.id,
          connectionRef: binding.connectionRef as string,
          memberId: binding.gatewayMemberId as string,
          startedAt: window.start,
          endedAt: window.end,
          status: 'running',
          errorReason: null,
          meetingCount: null,
          startedAtClock: now,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    try {
      const accessToken = this.gateway.openBindingToken(binding);
      const meetings = await withReadonlyRetry(
        () =>
          this.adapter.queryMeetings({
            accessToken,
            connectionRef: binding.connectionRef as string,
            memberId: binding.gatewayMemberId as string,
            window: {
              startedAt: window.start.toISOString(),
              endedAt: window.end.toISOString(),
            },
          }),
        { sleep: this.sleep, delaysMs: this.sleep ? [0, 0] : [1_000, 3_000] },
      );
      let stored = 0;
      for (const record of meetings) {
        await this.upsertMeeting(record, userId, accessToken, binding);
        stored += 1;
      }
      const finished = new Date();
      await this.connection
        .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
        .updateOne({
          filter: { id: runId, userId },
          values: {
            status: stored === 0 ? 'empty' : 'succeeded',
            meetingCount: stored,
            finishedAt: finished,
            updatedAt: finished,
          },
        });
    } catch (error) {
      const finished = new Date();
      const reason =
        error instanceof MeetingGatewayError
          ? error.reason
          : 'UPSTREAM_CONTRACT_ERROR';
      await this.connection
        .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
        .updateOne({
          filter: { id: runId, userId },
          values: {
            status: 'failed',
            errorReason: reason,
            finishedAt: finished,
            updatedAt: finished,
          },
        });
      throw error;
    }
    return this.get(runId);
  }

  private async findOwnedByMeetingCode(
    userId: string,
    meetingCode: string,
  ): Promise<Meeting | undefined> {
    const grants = await this.connection
      .repository<MeetingAccess>(MEETING_ACCESS)
      .findMany({ filter: { userId, canRead: true } });
    if (grants.length === 0) return undefined;
    for (const grant of grants) {
      const row = await this.connection.repository<Meeting>(MEETINGS).findOne({
        filter: { id: grant.meetingId, meetingCode },
      });
      if (row) return row;
    }
    return undefined;
  }

  private async upsertMeeting(
    record: GatewayMeetingRecord,
    userId: string,
    accessToken: string,
    binding: { connectionRef: string | null; gatewayMemberId: string | null },
  ): Promise<void> {
    const now = new Date();
    const missingCode =
      typeof record.meetingCode !== 'string' || !record.meetingCode.trim();
    const source = {
      sourceGatewayInstance: this.config.instanceId || 'default',
      sourceOrganization: record.organizationId,
      sourceConnectionRef: record.connectionRef,
      sourceUpstreamMeetingId: record.upstreamMeetingId,
      sourceCycleKey: record.cycleKey || '',
    };
    const byCode = missingCode
      ? undefined
      : await this.findOwnedByMeetingCode(userId, record.meetingCode);
    const existing =
      byCode ??
      (await this.connection.repository<Meeting>(MEETINGS).findOne({
        filter: source,
      }));
    const meetingId = existing?.id ?? randomUUID();
    const values = {
      title: record.title,
      meetingCode: missingCode ? null : record.meetingCode,
      startedAt: record.startedAt ? new Date(record.startedAt) : null,
      endedAt: record.endedAt ? new Date(record.endedAt) : null,
      sourceUpstreamMeetingId: record.upstreamMeetingId,
      sourceConnectionRef: record.connectionRef,
      sourceCycleKey: record.cycleKey || '',
      queryAnomaly: missingCode ? 'missing_meeting_code' : null,
      updatedAt: now,
    };
    if (existing) {
      await this.connection.repository<Meeting>(MEETINGS).updateOne({
        filter: { id: existing.id },
        values,
      });
    } else {
      await this.connection.repository<Meeting>(MEETINGS).createOne({
        values: {
          id: meetingId,
          ...source,
          ...values,
          participantFetchStatus: 'not_fetched',
          recordingFetchStatus: 'not_fetched',
          importState: 'not_imported',
          createdAt: now,
        },
      });
    }
    const access = this.connection.repository(MEETING_ACCESS);
    const grant = (await access.findOne({
      filter: { meetingId, userId },
    })) as MeetingAccess | undefined;
    if (grant) {
      await access.updateOne({
        filter: { id: grant.id },
        values: { canRead: true, updatedAt: now },
      });
    } else {
      await access.createOne({
        values: {
          id: randomUUID(),
          meetingId,
          userId,
          canRead: true,
          canWrite: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    await this.refreshParticipants(meetingId, record, accessToken);
    await this.refreshRecordings(meetingId, record, accessToken);
    void binding;
  }

  private async refreshParticipants(
    meetingId: string,
    record: GatewayMeetingRecord,
    accessToken: string,
  ): Promise<void> {
    try {
      const items = await withReadonlyRetry(
        () =>
          this.adapter.listParticipants({
            accessToken,
            connectionRef: record.connectionRef,
            meetingId: record.upstreamMeetingId,
          }),
        { sleep: this.sleep, delaysMs: this.sleep ? [0, 0] : [1_000, 3_000] },
      );
      const now = new Date();
      const keep = new Set(items.map((item) => item.upstreamParticipantId));
      for (const item of items) {
        const existing = await this.connection
          .repository<MeetingParticipant>(MEETING_PARTICIPANTS)
          .findOne({
            filter: {
              meetingId,
              upstreamParticipantId: item.upstreamParticipantId,
            },
          });
        const values = {
          joinName: item.joinName ?? null,
          displayName: item.displayName,
          department: item.department,
          joinedAt: item.joinedAt ? new Date(item.joinedAt) : null,
          jobTitle: item.jobTitle ?? null,
          isCorpMember: item.isCorpMember ?? null,
          updatedAt: now,
        };
        if (existing) {
          await this.connection
            .repository<MeetingParticipant>(MEETING_PARTICIPANTS)
            .updateOne({ filter: { id: existing.id }, values });
        } else {
          await this.connection
            .repository<MeetingParticipant>(MEETING_PARTICIPANTS)
            .createOne({
              values: {
                id: randomUUID(),
                meetingId,
                upstreamParticipantId: item.upstreamParticipantId,
                createdAt: now,
                ...values,
              },
            });
        }
      }
      const previous = await this.connection
        .repository<MeetingParticipant>(MEETING_PARTICIPANTS)
        .findMany({ filter: { meetingId } });
      for (const row of previous) {
        if (!keep.has(row.upstreamParticipantId)) {
          await this.connection
            .repository<MeetingParticipant>(MEETING_PARTICIPANTS)
            .deleteMany({ filter: { id: row.id } });
        }
      }
      await this.connection.repository<Meeting>(MEETINGS).updateOne({
        filter: { id: meetingId },
        values: {
          participantFetchStatus: (items.length
            ? 'fetched'
            : 'empty') satisfies FetchStatus,
          updatedAt: now,
        },
      });
    } catch {
      await this.connection.repository<Meeting>(MEETINGS).updateOne({
        filter: { id: meetingId },
        values: {
          participantFetchStatus: 'failed' satisfies FetchStatus,
          updatedAt: new Date(),
        },
      });
    }
  }

  private async refreshRecordings(
    meetingId: string,
    record: GatewayMeetingRecord,
    accessToken: string,
  ): Promise<void> {
    try {
      const items = await withReadonlyRetry(
        () =>
          this.adapter.listRecordings({
            accessToken,
            connectionRef: record.connectionRef,
            meetingId: record.upstreamMeetingId,
          }),
        { sleep: this.sleep, delaysMs: this.sleep ? [0, 0] : [1_000, 3_000] },
      );
      const now = new Date();
      const merged = new Map<string, (typeof items)[number]>();
      for (const item of items) {
        const prior = merged.get(item.recordFileId);
        if (!prior) {
          merged.set(item.recordFileId, item);
          continue;
        }
        const leftRank =
          item.importability === 'blocked'
            ? 2
            : item.importability === 'unknown'
              ? 1
              : 0;
        const rightRank =
          prior.importability === 'blocked'
            ? 2
            : prior.importability === 'unknown'
              ? 1
              : 0;
        merged.set(item.recordFileId, leftRank >= rightRank ? item : prior);
      }
      const keep = new Set(merged.keys());
      for (const item of merged.values()) {
        const existing = await this.connection
          .repository<MeetingRecording>(MEETING_RECORDINGS)
          .findOne({
            filter: { meetingId, recordFileId: item.recordFileId },
          });
        const values = {
          available: item.available,
          format: item.format,
          unavailableReason: item.unavailableReason,
          sharingUrl: item.sharingUrl ?? null,
          allowDownload: item.allowDownload ?? null,
          importability: item.importability ?? 'unknown',
          updatedAt: now,
        };
        if (existing) {
          await this.connection
            .repository<MeetingRecording>(MEETING_RECORDINGS)
            .updateOne({ filter: { id: existing.id }, values });
        } else {
          await this.connection
            .repository<MeetingRecording>(MEETING_RECORDINGS)
            .createOne({
              values: {
                id: randomUUID(),
                meetingId,
                recordFileId: item.recordFileId,
                createdAt: now,
                ...values,
              },
            });
        }
      }
      const previous = await this.connection
        .repository<MeetingRecording>(MEETING_RECORDINGS)
        .findMany({ filter: { meetingId } });
      for (const row of previous) {
        if (!keep.has(row.recordFileId)) {
          await this.connection
            .repository<MeetingRecording>(MEETING_RECORDINGS)
            .deleteMany({ filter: { id: row.id } });
        }
      }
      await this.connection.repository<Meeting>(MEETINGS).updateOne({
        filter: { id: meetingId },
        values: {
          recordingFetchStatus: (items.length
            ? 'fetched'
            : 'empty') satisfies FetchStatus,
          updatedAt: now,
        },
      });
    } catch {
      await this.connection.repository<Meeting>(MEETINGS).updateOne({
        filter: { id: meetingId },
        values: {
          recordingFetchStatus: 'failed' satisfies FetchStatus,
          updatedAt: new Date(),
        },
      });
    }
  }
}
