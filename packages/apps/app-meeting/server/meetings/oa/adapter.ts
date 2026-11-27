export interface OaPerson {
  readonly fd_no: string;
  readonly fd_name: string;
  readonly fd_department: string;
}

export interface OaToken {
  readonly accessToken: string;
  readonly expiresAt: string;
}

export interface FrozenOaMeeting {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly location: string;
  readonly purpose: string;
  readonly remark: string;
  readonly attendeeEmployeeNos: readonly string[];
  readonly attendeeSnapshots: readonly OaPerson[];
  readonly emceeEmployeeNo: string | null;
  readonly hostEmployeeNo: string | null;
  readonly otherAttendPerson: string | null;
}

export interface FrozenOaTask {
  readonly clientTaskId: string;
  readonly title: string;
  readonly assigneeEmployeeNo: string;
  readonly assigneeName: string | null;
  readonly appointEmployeeNo: string | null;
  readonly appointName: string | null;
  readonly attentionEmployeeNos: readonly string[];
  readonly startAt: string | null;
  readonly dueAt: string;
  readonly description: string | null;
}

export interface FrozenOaPayload {
  readonly creatorUserId: string;
  readonly creatorEmployeeNo: string;
  readonly oaTarget: string;
  readonly meeting: FrozenOaMeeting;
  readonly summaryTitle: string;
  readonly summary: string;
  readonly summaryCompleteTime: string;
  readonly actualAttendEmployeeNos: readonly string[];
  readonly copyToEmployeeNos: readonly string[];
  readonly tasks: readonly FrozenOaTask[];
}

export interface OaCreateMeetingResult {
  readonly externalMeetingId: string;
}

export interface OaUploadSummaryResult {
  readonly uploaded: true;
  readonly externalSummaryId: string;
  readonly externalMeetingId: string;
}

export type OaTaskWriteStatus = 'succeeded' | 'failed_confirmed' | 'unknown';

export interface OaTaskWriteResult {
  readonly clientTaskId: string;
  readonly status: OaTaskWriteStatus;
  readonly externalTaskId: string | null;
  readonly errorCode: string | null;
}

export type OaContractMode = 'unavailable' | 'test' | 'configured';

/** Directory search mode: name → fd_name; employeeNo → fd_no exact lookup. */
export type OaPeopleSearchBy = 'name' | 'employeeNo';

export interface MeetingOaAdapter {
  readonly kind: 'http' | 'test';
  readonly writeContract: OaContractMode;
  readonly tokenContract: OaContractMode;
  searchPeople(
    query: string,
    by?: OaPeopleSearchBy,
  ): Promise<readonly OaPerson[]>;
  getToken(employeeNo: string): Promise<OaToken>;
  createMeeting(
    token: OaToken,
    payload: FrozenOaPayload,
  ): Promise<OaCreateMeetingResult>;
  uploadSummary(
    token: OaToken,
    payload: FrozenOaPayload,
    externalMeetingId: string,
  ): Promise<OaUploadSummaryResult>;
  createTaskByMeeting(
    token: OaToken,
    payload: FrozenOaPayload,
    externalMeetingId: string,
  ): Promise<readonly OaTaskWriteResult[]>;
}
