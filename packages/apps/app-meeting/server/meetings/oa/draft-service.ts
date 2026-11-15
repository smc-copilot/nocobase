import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import {
  requireMeetingAction,
  requireReadableMeeting,
  requireUser,
  toIso,
} from '../access.js';
import { MeetingContentService } from '../content-service.js';
import { parseJsonField } from '../minutes.js';
import {
  MEETING_OA_DRAFT_TASKS,
  MEETING_OA_DRAFTS,
  MEETING_OA_OPERATIONS,
  type MeetingOaDraft,
  type MeetingOaDraftTask,
  type MeetingOaOperation,
} from '../resources.js';
import type { FrozenOaPayload, FrozenOaTask } from './adapter.js';
import { MeetingOaError } from './errors.js';

export interface DraftTaskInput {
  clientTaskId?: string;
  title: string;
  assigneeEmployeeNo?: string | null;
  assigneeName?: string | null;
  dueAt?: string | null;
  description?: string | null;
}

export interface DraftPublic {
  meetingId: string;
  version: number;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  attendeeEmployeeNos: readonly string[];
  summary: string | null;
  tasks: readonly DraftTaskPublic[];
  filledFromContentVersion: number | null;
  writesOa: false;
  isolationAdapter: boolean;
}

export interface DraftTaskPublic {
  clientTaskId: string;
  title: string;
  assigneeEmployeeNo: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  description: string | null;
  fromSourceTodo: boolean;
}

const DUE_AT = /^\d{4}-\d{2}-\d{2}$/;

export class MeetingOaDraftService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly contents: MeetingContentService,
    private readonly userId: string | undefined,
    private readonly isolationAdapter = false,
  ) {}

  async get(meetingId: string): Promise<DraftPublic> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const row = await this.ensure(meetingId);
    return this.publicDraft(row);
  }

  async save(
    meetingId: string,
    input: {
      expectedVersion: number;
      title?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      location?: string | null;
      attendeeEmployeeNos?: readonly string[];
      summary?: string | null;
      tasks?: readonly DraftTaskInput[];
    },
  ): Promise<DraftPublic> {
    await requireMeetingAction(this.authz, 'oaDraftEdit');
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    await this.assertUnlocked(meetingId);
    const userId = requireUser(this.userId);
    const current = await this.ensure(meetingId);
    if (current.version !== input.expectedVersion) {
      throw new MeetingOaError(
        'OA_DRAFT_VERSION_CONFLICT',
        'The OA draft was changed by another request.',
        'ABORTED',
      );
    }
    const now = new Date();
    await this.connection.transaction(async (trx) => {
      await trx.repository<MeetingOaDraft>(MEETING_OA_DRAFTS).updateOne({
        filter: { id: current.id, version: current.version },
        values: {
          version: current.version + 1,
          title: input.title ?? current.title,
          startAt: input.startAt ? new Date(input.startAt) : current.startAt,
          endAt: input.endAt ? new Date(input.endAt) : current.endAt,
          location: input.location ?? current.location,
          attendeeEmployeeNos:
            input.attendeeEmployeeNos != null
              ? [...input.attendeeEmployeeNos]
              : current.attendeeEmployeeNos,
          summary: input.summary ?? current.summary,
          updatedBy: userId,
          updatedAt: now,
        },
      });
      if (input.tasks) {
        const existing = await trx
          .repository<MeetingOaDraftTask>(MEETING_OA_DRAFT_TASKS)
          .findMany({ filter: { draftId: current.id } });
        const keep = new Set(
          input.tasks.map((task) => task.clientTaskId).filter(Boolean),
        );
        for (const row of existing) {
          if (!keep.has(row.clientTaskId)) {
            await trx
              .repository<MeetingOaDraftTask>(MEETING_OA_DRAFT_TASKS)
              .deleteOne({ filter: { id: row.id } });
          }
        }
        for (const task of input.tasks) {
          this.assertTask(task);
          const clientTaskId = task.clientTaskId?.trim() || randomUUID();
          const found = existing.find(
            (row) => row.clientTaskId === clientTaskId,
          );
          const values = {
            title: task.title.trim(),
            assigneeEmployeeNo: task.assigneeEmployeeNo?.trim() || null,
            assigneeName: task.assigneeName?.trim() || null,
            dueAt: task.dueAt?.trim() || null,
            description: task.description ?? null,
            updatedAt: now,
          };
          if (found) {
            await trx
              .repository<MeetingOaDraftTask>(MEETING_OA_DRAFT_TASKS)
              .updateOne({ filter: { id: found.id }, values });
          } else {
            await trx
              .repository<MeetingOaDraftTask>(MEETING_OA_DRAFT_TASKS)
              .createOne({
                values: {
                  id: randomUUID(),
                  draftId: current.id,
                  clientTaskId,
                  fromSourceTodo: false,
                  createdAt: now,
                  ...values,
                },
              });
          }
        }
      }
    });
    return this.get(meetingId);
  }

  async refill(
    meetingId: string,
    expectedVersion: number,
  ): Promise<DraftPublic> {
    const content = await this.contents.get(meetingId);
    const meeting = await requireReadableMeeting(
      this.connection,
      this.authz,
      meetingId,
    );
    return this.save(meetingId, {
      expectedVersion,
      title: meeting.title,
      startAt: toIso(meeting.startedAt),
      endAt: toIso(meeting.endedAt),
      summary: content.minutes.text,
    });
  }

  async freeze(
    meetingId: string,
    creator: { creatorUserId: string; creatorEmployeeNo: string },
  ): Promise<{ draft: MeetingOaDraft; payload: FrozenOaPayload }> {
    const draft = await this.ensure(meetingId);
    const tasks = await this.tasks(draft.id);
    const title = draft.title?.trim();
    const startAt = toIso(draft.startAt);
    const summary = draft.summary?.trim();
    if (!title || !startAt || !summary) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'OA draft title, start time and summary are required before sync.',
        'INVALID_ARGUMENT',
      );
    }
    const frozenTasks: FrozenOaTask[] = tasks.map((task) => {
      if (!task.assigneeEmployeeNo?.trim() || !task.title.trim()) {
        throw new MeetingOaError(
          'OA_DRAFT_INVALID',
          'Each assigned OA task needs a title and employee number.',
          'INVALID_ARGUMENT',
        );
      }
      if (task.dueAt && !DUE_AT.test(task.dueAt)) {
        throw new MeetingOaError(
          'OA_DRAFT_INVALID',
          'Task due dates must be YYYY-MM-DD.',
          'INVALID_ARGUMENT',
        );
      }
      return {
        clientTaskId: task.clientTaskId,
        title: task.title,
        assigneeEmployeeNo: task.assigneeEmployeeNo,
        assigneeName: task.assigneeName,
        dueAt: task.dueAt,
        description: task.description,
      };
    });
    return {
      draft,
      payload: {
        creatorUserId: creator.creatorUserId,
        creatorEmployeeNo: creator.creatorEmployeeNo,
        oaTarget: 'default',
        meeting: {
          title,
          startAt,
          endAt: toIso(draft.endAt),
          location: draft.location,
          attendeeEmployeeNos:
            parseJsonField<string[]>(draft.attendeeEmployeeNos) ?? [],
        },
        summary,
        tasks: frozenTasks,
      },
    };
  }

  private async assertUnlocked(meetingId: string): Promise<void> {
    const operation = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { meetingId } });
    if (!operation) return;
    if (operation.status === 'succeeded') {
      throw new MeetingOaError(
        'OA_SYNC_COMPLETE',
        'A successful OA create intent cannot be edited in this period.',
        'FAILED_PRECONDITION',
      );
    }
    if (operation.status === 'unknown' || operation.status === 'partial') {
      throw new MeetingOaError(
        'OA_RESULT_UNKNOWN',
        'The frozen OA intent is under reconcile and cannot be edited.',
        'FAILED_PRECONDITION',
      );
    }
    throw new MeetingOaError(
      'OA_SYNC_IN_PROGRESS',
      'The frozen OA intent cannot be edited while an operation exists.',
      'FAILED_PRECONDITION',
    );
  }

  private assertTask(task: DraftTaskInput): void {
    if (!task.title?.trim()) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Task title is required.',
        'INVALID_ARGUMENT',
      );
    }
    if (task.dueAt && !DUE_AT.test(task.dueAt)) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Task due dates must be YYYY-MM-DD.',
        'INVALID_ARGUMENT',
      );
    }
  }

  private async ensure(meetingId: string): Promise<MeetingOaDraft> {
    const existing = await this.connection
      .repository<MeetingOaDraft>(MEETING_OA_DRAFTS)
      .findOne({ filter: { meetingId } });
    if (existing) return existing;
    const meeting = await requireReadableMeeting(
      this.connection,
      this.authz,
      meetingId,
    );
    const content = await this.contents.get(meetingId);
    const now = new Date();
    const id = randomUUID();
    await this.connection
      .repository<MeetingOaDraft>(MEETING_OA_DRAFTS)
      .createOne({
        values: {
          id,
          meetingId,
          version: 1,
          title: meeting.title,
          startAt: meeting.startedAt,
          endAt: meeting.endedAt,
          location: null,
          attendeeEmployeeNos: [],
          summary: content.minutes.text || null,
          filledFromContentVersion: content.contentVersion,
          updatedBy: requireUser(this.userId),
          createdAt: now,
          updatedAt: now,
        },
      });
    return (await this.connection
      .repository<MeetingOaDraft>(MEETING_OA_DRAFTS)
      .findOne({ filter: { id } })) as MeetingOaDraft;
  }

  private async tasks(draftId: string): Promise<MeetingOaDraftTask[]> {
    return this.connection
      .repository<MeetingOaDraftTask>(MEETING_OA_DRAFT_TASKS)
      .findMany({
        filter: { draftId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
  }

  private async publicDraft(row: MeetingOaDraft): Promise<DraftPublic> {
    const tasks = await this.tasks(row.id);
    return {
      meetingId: row.meetingId,
      version: row.version,
      title: row.title,
      startAt: toIso(row.startAt),
      endAt: toIso(row.endAt),
      location: row.location,
      attendeeEmployeeNos:
        parseJsonField<string[]>(row.attendeeEmployeeNos) ?? [],
      summary: row.summary,
      tasks: tasks.map((task) => ({
        clientTaskId: task.clientTaskId,
        title: task.title,
        assigneeEmployeeNo: task.assigneeEmployeeNo,
        assigneeName: task.assigneeName,
        dueAt: task.dueAt,
        description: task.description,
        fromSourceTodo: task.fromSourceTodo,
      })),
      filledFromContentVersion: row.filledFromContentVersion,
      writesOa: false,
      isolationAdapter: this.isolationAdapter,
    };
  }
}
