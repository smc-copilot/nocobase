import type { FrozenOaPayload } from './adapter.js';
import { isoToBeijingDateTime } from './beijing-time.js';

function person(no: string): { PersonNo: string } {
  return { PersonNo: no };
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
  const body: Record<string, unknown> = {
    meetingName: payload.meeting.title,
    holdDate: isoToBeijingDateTime(payload.meeting.startAt),
    finishDate: isoToBeijingDateTime(payload.meeting.endAt),
    creator: person(payload.creatorEmployeeNo),
    place: payload.meeting.location,
    meetingAim: payload.meeting.purpose,
    attendPersons: payload.meeting.attendeeEmployeeNos.map(person),
    remark: payload.meeting.remark,
  };
  if (payload.meeting.emceeEmployeeNo) {
    body.emcee = person(payload.meeting.emceeEmployeeNo);
  }
  if (payload.meeting.hostEmployeeNo) {
    body.host = person(payload.meeting.hostEmployeeNo);
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
  const body: Record<string, unknown> = {
    meetingId: externalMeetingId,
    summaryTitle: payload.summaryTitle,
    summaryContent: summaryHtml(payload.summary),
    inputPerson: person(payload.creatorEmployeeNo),
    actualAttendPersons: payload.actualAttendEmployeeNos.map(person),
    summaryCompleteTime: payload.summaryCompleteTime,
  };
  if (payload.copyToEmployeeNos.length) {
    body.copyToPersons = payload.copyToEmployeeNos.map(person);
  }
  return body;
}

export function buildTaskAssignmentBody(
  payload: FrozenOaPayload,
  externalMeetingId: string,
) {
  return {
    meetingId: externalMeetingId,
    tasks: payload.tasks.map((task) => {
      const item: Record<string, unknown> = {
        taskName: task.title,
        taskContent: task.description?.trim() || task.title,
        planCompleteTime: task.dueAt,
        appointPerson: person(
          task.appointEmployeeNo || payload.creatorEmployeeNo,
        ),
        performPersons: [person(task.assigneeEmployeeNo)],
        notifyType: 'todo',
      };
      if (task.startAt) item.planStartTime = task.startAt;
      if (task.attentionEmployeeNos.length) {
        item.attentionPersons = task.attentionEmployeeNos.map(person);
      }
      return item;
    }),
  };
}
