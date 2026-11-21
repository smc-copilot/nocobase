import type { FrozenOaPayload } from './adapter.js';
import { isoToBeijingDateTime, toOaDateTime } from './beijing-time.js';
import { MeetingOaError } from './errors.js';

export type OaPersonNo = { readonly PersonNo: string };

/** True when a trimmed value is not a usable OA employee number. */
export function isIllegalEmployeeNo(value: string): boolean {
  const no = value.trim();
  if (!no) return true;
  if (no.includes(',') || no.includes('，') || no.includes(';')) return true;
  // Bare Chinese/CJK display names must never become PersonNo.
  if (/^[\u3400-\u9fff\uF900-\uFAFF\s·•.]+$/u.test(no)) return true;
  return false;
}

export function normalizeEmployeeNo(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new MeetingOaError(
      'OA_DRAFT_INVALID',
      `OA person field ${fieldPath} must be a non-empty employee number string.`,
      'INVALID_ARGUMENT',
    );
  }
  const no = value.trim();
  if (isIllegalEmployeeNo(no)) {
    throw new MeetingOaError(
      'OA_DRAFT_INVALID',
      `OA person field ${fieldPath} has an invalid employee number.`,
      'INVALID_ARGUMENT',
    );
  }
  return no;
}

export function personNo(value: unknown, fieldPath: string): OaPersonNo {
  return { PersonNo: normalizeEmployeeNo(value, fieldPath) };
}

export function personNoList(
  values: readonly unknown[],
  fieldPath: string,
): OaPersonNo[] {
  return values.map((value, index) =>
    personNo(value, `${fieldPath}[${String(index)}]`),
  );
}

/** Validate every PersonNo source on a frozen payload before any OA write. */
export function assertFrozenPersonNos(payload: FrozenOaPayload): void {
  normalizeEmployeeNo(payload.creatorEmployeeNo, 'creator');
  if (payload.meeting.attendeeEmployeeNos.length < 1) {
    throw new MeetingOaError(
      'OA_DRAFT_INVALID',
      'OA person field attendPersons requires at least one employee number.',
      'INVALID_ARGUMENT',
    );
  }
  for (const [index, no] of payload.meeting.attendeeEmployeeNos.entries()) {
    normalizeEmployeeNo(no, `attendPersons[${String(index)}]`);
  }
  if (payload.meeting.emceeEmployeeNo) {
    normalizeEmployeeNo(payload.meeting.emceeEmployeeNo, 'emcee');
  }
  if (payload.meeting.hostEmployeeNo) {
    normalizeEmployeeNo(payload.meeting.hostEmployeeNo, 'host');
  }
  if (payload.actualAttendEmployeeNos.length < 1) {
    throw new MeetingOaError(
      'OA_DRAFT_INVALID',
      'OA person field actualAttendPersons requires at least one employee number.',
      'INVALID_ARGUMENT',
    );
  }
  for (const [index, no] of payload.actualAttendEmployeeNos.entries()) {
    normalizeEmployeeNo(no, `actualAttendPersons[${String(index)}]`);
  }
  for (const [index, no] of payload.copyToEmployeeNos.entries()) {
    normalizeEmployeeNo(no, `copyToPersons[${String(index)}]`);
  }
  for (const [taskIndex, task] of payload.tasks.entries()) {
    const prefix = `tasks[${String(taskIndex)}]`;
    normalizeEmployeeNo(task.assigneeEmployeeNo, `${prefix}.performPersons`);
    normalizeEmployeeNo(
      task.appointEmployeeNo || payload.creatorEmployeeNo,
      `${prefix}.appointPerson`,
    );
    for (const [index, no] of task.attentionEmployeeNos.entries()) {
      normalizeEmployeeNo(no, `${prefix}.attentionPersons[${String(index)}]`);
    }
  }
}

function summaryHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p>${line
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')}</p>`,
    )
    .join('');
}

export function buildCreateMeetingBody(payload: FrozenOaPayload) {
  assertFrozenPersonNos(payload);
  const body: Record<string, unknown> = {
    meetingName: payload.meeting.title,
    holdDate: isoToBeijingDateTime(payload.meeting.startAt),
    finishDate: isoToBeijingDateTime(payload.meeting.endAt),
    creator: personNo(payload.creatorEmployeeNo, 'creator'),
    place: payload.meeting.location,
    meetingAim: payload.meeting.purpose,
    attendPersons: personNoList(
      payload.meeting.attendeeEmployeeNos,
      'attendPersons',
    ),
    remark: payload.meeting.remark,
  };
  if (payload.meeting.emceeEmployeeNo) {
    body.emcee = personNo(payload.meeting.emceeEmployeeNo, 'emcee');
  }
  if (payload.meeting.hostEmployeeNo) {
    body.host = personNo(payload.meeting.hostEmployeeNo, 'host');
  }
  if (payload.meeting.otherAttendPerson) {
    body.otherAttendPerson = payload.meeting.otherAttendPerson;
  }
  return body;
}

export function buildUploadSummaryBody(
  payload: FrozenOaPayload,
  externalMeetingId: string,
) {
  assertFrozenPersonNos(payload);
  const body: Record<string, unknown> = {
    meetingId: externalMeetingId,
    summaryTitle: payload.summaryTitle,
    summaryContent: summaryHtml(payload.summary),
    inputPerson: personNo(payload.creatorEmployeeNo, 'inputPerson'),
    actualAttendPersons: personNoList(
      payload.actualAttendEmployeeNos,
      'actualAttendPersons',
    ),
    summaryCompleteTime:
      toOaDateTime(payload.summaryCompleteTime) ?? payload.summaryCompleteTime,
  };
  if (payload.copyToEmployeeNos.length) {
    body.copyToPersons = personNoList(
      payload.copyToEmployeeNos,
      'copyToPersons',
    );
  }
  return body;
}

export function buildTaskAssignmentBody(
  payload: FrozenOaPayload,
  externalMeetingId: string,
) {
  assertFrozenPersonNos(payload);
  return {
    meetingId: externalMeetingId,
    tasks: payload.tasks.map((task, taskIndex) => {
      const prefix = `tasks[${String(taskIndex)}]`;
      const item: Record<string, unknown> = {
        taskName: task.title,
        taskContent: task.description?.trim() || task.title,
        planCompleteTime: task.dueAt,
        appointPerson: personNo(
          task.appointEmployeeNo || payload.creatorEmployeeNo,
          `${prefix}.appointPerson`,
        ),
        performPersons: [
          personNo(task.assigneeEmployeeNo, `${prefix}.performPersons`),
        ],
        notifyType: 'todo',
      };
      if (task.startAt) item.planStartTime = task.startAt;
      if (task.attentionEmployeeNos.length) {
        item.attentionPersons = personNoList(
          task.attentionEmployeeNos,
          `${prefix}.attentionPersons`,
        );
      }
      return item;
    }),
  };
}
