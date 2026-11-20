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
  type MeetingPersonSnapshot,
} from '../resources.js';
import type { FrozenOaPayload, FrozenOaTask, OaPerson } from './adapter.js';
import {
  dueAtToOa,
  isoToBeijingDateTime,
  startAtToOa,
  toOaDateTime,
} from './beijing-time.js';
import { MeetingOaError } from './errors.js';

export interface DraftTaskInput {
  clientTaskId?: string;
  title: string;
  assigneeEmployeeNo?: string | null;
  assigneeName?: string | null;
  appointEmployeeNo?: string | null;
  appointName?: string | null;
  attentionEmployeeNos?: readonly string[] | null;
  attentionSnapshots?: readonly OaPerson[] | null;
  startAt?: string | null;
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
  purpose: string | null;
  remark: string | null;
  otherAttendPerson: string | null;
  attendeeEmployeeNos: readonly string[];
  attendeeSnapshots: readonly OaPerson[];
  emceeSnapshot: OaPerson | null;
  hostSnapshot: OaPerson | null;
  actualAttendSnapshots: readonly OaPerson[];
  copyToSnapshots: readonly OaPerson[];
  summaryTitle: string | null;
  summary: string | null;
  summaryCompleteTime: string | null;
  tasks: readonly DraftTaskPublic[];
  filledFromContentVersion: number | null;
  frozen: boolean;
  operationId: string | null;
  writesOa: false;
  isolationAdapter: boolean;
}

export interface DraftTaskPublic {
  clientTaskId: string;
  title: string;
  assigneeEmployeeNo: string | null;
  assigneeName: string | null;
  appointEmployeeNo: string | null;
  appointName: string | null;
  attentionEmployeeNos: readonly string[];
  attentionSnapshots: readonly OaPerson[];
  startAt: string | null;
  dueAt: string | null;
  description: string | null;
  fromSourceTodo: boolean;
}

const DUE_AT = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

function asPerson(value: unknown): OaPerson | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const fd_no = typeof row.fd_no === 'string' ? row.fd_no.trim() : '';
  const fd_name = typeof row.fd_name === 'string' ? row.fd_name.trim() : '';
  if (!fd_no) return null;
  return {
    fd_no,
    fd_name: fd_name || fd_no,
    fd_department:
      typeof row.fd_department === 'string' ? row.fd_department.trim() : '',
  };
}

function peopleOf(value: unknown): OaPerson[] {
  const rows = parseJsonField<unknown[]>(value) ?? [];
  if (!Array.isArray(rows)) {
    const one = asPerson(value);
    return one ? [one] : [];
  }
  return rows.map(asPerson).filter((row): row is OaPerson => row !== null);
}

function uniqueNos(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const no = value.trim();
    if (!no || seen.has(no)) continue;
    seen.add(no);
    result.push(no);
  }
  return result;
}

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
      purpose?: string | null;
      remark?: string | null;
      otherAttendPerson?: string | null;
      attendeeEmployeeNos?: readonly string[];
      attendeeSnapshots?: readonly OaPerson[];
      emceeSnapshot?: OaPerson | null;
      hostSnapshot?: OaPerson | null;
      actualAttendSnapshots?: readonly OaPerson[];
      copyToSnapshots?: readonly OaPerson[];
      summaryTitle?: string | null;
      summary?: string | null;
      summaryCompleteTime?: string | null;
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
          title: input.title !== undefined ? input.title : current.title,
          startAt:
            input.startAt !== undefined
              ? input.startAt
                ? new Date(input.startAt)
                : null
              : current.startAt,
          endAt:
            input.endAt !== undefined
              ? input.endAt
                ? new Date(input.endAt)
                : null
              : current.endAt,
          location:
            input.location !== undefined ? input.location : current.location,
          purpose:
            input.purpose !== undefined ? input.purpose : current.purpose,
          remark: input.remark !== undefined ? input.remark : current.remark,
          otherAttendPerson:
            input.otherAttendPerson !== undefined
              ? input.otherAttendPerson
              : current.otherAttendPerson,
          attendeeEmployeeNos:
            input.attendeeEmployeeNos != null
              ? uniqueNos([...input.attendeeEmployeeNos])
              : current.attendeeEmployeeNos,
          attendeeSnapshots:
            input.attendeeSnapshots !== undefined
              ? [...input.attendeeSnapshots]
              : current.attendeeSnapshots,
          emceeSnapshot:
            input.emceeSnapshot !== undefined
              ? input.emceeSnapshot
              : current.emceeSnapshot,
          hostSnapshot:
            input.hostSnapshot !== undefined
              ? input.hostSnapshot
              : current.hostSnapshot,
          actualAttendSnapshots:
            input.actualAttendSnapshots !== undefined
              ? [...input.actualAttendSnapshots]
              : current.actualAttendSnapshots,
          copyToSnapshots:
            input.copyToSnapshots !== undefined
              ? [...input.copyToSnapshots]
              : current.copyToSnapshots,
          summaryTitle:
            input.summaryTitle !== undefined
              ? input.summaryTitle
              : current.summaryTitle,
          summary:
            input.summary !== undefined ? input.summary : current.summary,
          summaryCompleteTime:
            input.summaryCompleteTime !== undefined
              ? input.summaryCompleteTime
                ? toOaDateTime(input.summaryCompleteTime)
                : null
              : current.summaryCompleteTime,
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
            appointEmployeeNo: task.appointEmployeeNo?.trim() || null,
            appointName: task.appointName?.trim() || null,
            attentionEmployeeNos: uniqueNos([
              ...(task.attentionEmployeeNos ?? []),
            ]),
            attentionSnapshots: [...(task.attentionSnapshots ?? [])],
            startAt: task.startAt?.trim() || null,
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
    const todos = content.sourceTodos
      .map((item) => item.title)
      .filter(Boolean)
      .join('\n');
    return this.save(meetingId, {
      expectedVersion,
      title: meeting.title,
      startAt: toIso(meeting.startedAt),
      endAt: toIso(meeting.endedAt),
      location: meeting.meetingCode
        ? `腾讯会议 ${meeting.meetingCode}`
        : meeting.title,
      purpose: meeting.title,
      remark:
        todos ||
        (meeting.meetingCode ? `腾讯会议 ${meeting.meetingCode}` : null),
      summary: content.minutes.text,
    });
  }

  async freeze(
    meetingId: string,
    creator: { creatorUserId: string; creatorEmployeeNo: string },
  ): Promise<{ draft: MeetingOaDraft; payload: FrozenOaPayload }> {
    const draft = await this.ensure(meetingId);
    const tasks = await this.tasks(draft.id);
    const title = draft.title?.trim() || '';
    const startAt = toIso(draft.startAt);
    const endAt = toIso(draft.endAt);
    const location = draft.location?.trim() || '';
    // Purpose is required by OA createMeeting; default to title when the form left it blank.
    const purpose = draft.purpose?.trim() || title;
    const summary = draft.summary?.trim() || '';
    const attendees = uniqueNos(
      parseJsonField<string[]>(draft.attendeeEmployeeNos) ?? [],
    );
    const missing = (
      [
        ['title', title],
        ['startAt', startAt],
        ['endAt', endAt],
        ['location', location],
        ['purpose', purpose],
        ['summary', summary],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        `OA draft is missing required fields before sync: ${missing.join(', ')}.`,
        'INVALID_ARGUMENT',
      );
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Meeting end time must be after start time.',
        'INVALID_ARGUMENT',
      );
    }
    if (attendees.length < 1 || attendees.length > 200) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'At least one attendee employee number is required.',
        'INVALID_ARGUMENT',
      );
    }
    const blankTask = (task: MeetingOaDraftTask) =>
      !task.title.trim() &&
      !task.assigneeEmployeeNo?.trim() &&
      !task.dueAt?.trim();
    const completeTask = (task: MeetingOaDraftTask) =>
      Boolean(
        task.title.trim() &&
        task.assigneeEmployeeNo?.trim() &&
        task.dueAt?.trim(),
      );
    if (tasks.some((task) => !blankTask(task) && !completeTask(task))) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Every started OA task needs a title, assignee and due date before sync.',
        'INVALID_ARGUMENT',
      );
    }
    const completeTasks = tasks.filter(completeTask);
    if (completeTasks.length < 1) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'At least one complete OA task is required before sync.',
        'INVALID_ARGUMENT',
      );
    }
    const frozenTasks: FrozenOaTask[] = completeTasks.map((task) => {
      const dueAt = dueAtToOa(task.dueAt);
      if (!dueAt) {
        throw new MeetingOaError(
          'OA_DRAFT_INVALID',
          'Each assigned OA task needs a due date.',
          'INVALID_ARGUMENT',
        );
      }
      const start = startAtToOa(task.startAt);
      if (start && start >= dueAt) {
        throw new MeetingOaError(
          'OA_DRAFT_INVALID',
          'Task start must be earlier than due date.',
          'INVALID_ARGUMENT',
        );
      }
      return {
        clientTaskId: task.clientTaskId,
        title: task.title,
        assigneeEmployeeNo: task.assigneeEmployeeNo as string,
        assigneeName: task.assigneeName,
        appointEmployeeNo: task.appointEmployeeNo,
        appointName: task.appointName,
        attentionEmployeeNos: uniqueNos(
          parseJsonField<string[]>(task.attentionEmployeeNos) ?? [],
        ),
        startAt: start,
        dueAt,
        description: task.description,
      };
    });
    let summaryCompleteTime = toOaDateTime(draft.summaryCompleteTime) ?? '';
    if (!summaryCompleteTime) {
      summaryCompleteTime = isoToBeijingDateTime(new Date().toISOString());
      await this.connection
        .repository<MeetingOaDraft>(MEETING_OA_DRAFTS)
        .updateOne({
          filter: { id: draft.id },
          values: { summaryCompleteTime, updatedAt: new Date() },
        });
      draft.summaryCompleteTime = summaryCompleteTime;
    }
    const actual = peopleOf(draft.actualAttendSnapshots);
    const copies = peopleOf(draft.copyToSnapshots);
    const emcee = asPerson(draft.emceeSnapshot);
    const host = asPerson(draft.hostSnapshot);
    return {
      draft,
      payload: {
        creatorUserId: creator.creatorUserId,
        creatorEmployeeNo: creator.creatorEmployeeNo,
        oaTarget: 'default',
        meeting: {
          title,
          startAt,
          endAt,
          location,
          purpose,
          remark: draft.remark?.trim() ?? '',
          attendeeEmployeeNos: attendees,
          attendeeSnapshots: peopleOf(draft.attendeeSnapshots),
          emceeEmployeeNo: emcee?.fd_no ?? null,
          hostEmployeeNo: host?.fd_no ?? null,
          otherAttendPerson: draft.otherAttendPerson?.trim() || null,
        },
        summaryTitle: draft.summaryTitle?.trim() || `${title}-会议纪要`,
        summary,
        summaryCompleteTime,
        actualAttendEmployeeNos:
          actual.length > 0 ? actual.map((row) => row.fd_no) : attendees,
        copyToEmployeeNos: copies.map((row) => row.fd_no),
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
    if (task.dueAt && !DUE_AT.test(task.dueAt.trim())) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Task due dates must be YYYY-MM-DD or a datetime.',
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
    const todos = content.sourceTodos
      .map((item) => item.title)
      .filter(Boolean)
      .join('\n');
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
          location: meeting.meetingCode
            ? `腾讯会议 ${meeting.meetingCode}`
            : meeting.title,
          purpose: meeting.title,
          remark: todos || null,
          otherAttendPerson: null,
          attendeeEmployeeNos: [],
          attendeeSnapshots: [],
          emceeSnapshot: null,
          hostSnapshot: null,
          actualAttendSnapshots: [],
          copyToSnapshots: [],
          summaryTitle: meeting.title ? `${meeting.title}-会议纪要` : null,
          summary: content.minutes.text || null,
          summaryCompleteTime: null,
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
    const operation = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { meetingId: row.meetingId } });
    return {
      meetingId: row.meetingId,
      version: row.version,
      title: row.title,
      startAt: toIso(row.startAt),
      endAt: toIso(row.endAt),
      location: row.location,
      purpose: row.purpose ?? null,
      remark: row.remark ?? null,
      otherAttendPerson: row.otherAttendPerson ?? null,
      attendeeEmployeeNos:
        parseJsonField<string[]>(row.attendeeEmployeeNos) ?? [],
      attendeeSnapshots: peopleOf(row.attendeeSnapshots),
      emceeSnapshot: asPerson(row.emceeSnapshot),
      hostSnapshot: asPerson(row.hostSnapshot),
      actualAttendSnapshots: peopleOf(row.actualAttendSnapshots),
      copyToSnapshots: peopleOf(row.copyToSnapshots),
      summaryTitle: row.summaryTitle ?? null,
      summary: row.summary,
      summaryCompleteTime: row.summaryCompleteTime ?? null,
      tasks: tasks.map((task) => ({
        clientTaskId: task.clientTaskId,
        title: task.title,
        assigneeEmployeeNo: task.assigneeEmployeeNo,
        assigneeName: task.assigneeName,
        appointEmployeeNo: task.appointEmployeeNo ?? null,
        appointName: task.appointName ?? null,
        attentionEmployeeNos: uniqueNos(
          parseJsonField<string[]>(task.attentionEmployeeNos) ?? [],
        ),
        attentionSnapshots: peopleOf(task.attentionSnapshots),
        startAt: task.startAt ?? null,
        dueAt: task.dueAt,
        description: task.description,
        fromSourceTodo: task.fromSourceTodo,
      })),
      filledFromContentVersion: row.filledFromContentVersion,
      frozen: Boolean(operation),
      operationId: operation?.id ?? null,
      writesOa: false,
      isolationAdapter: this.isolationAdapter,
    };
  }
}

export type { MeetingPersonSnapshot };
