import type {
  FrozenOaPayload,
  MeetingOaAdapter,
  OaCreateMeetingResult,
  OaPerson,
  OaTaskWriteResult,
  OaToken,
  OaUploadSummaryResult,
} from './adapter.js';
import { MeetingOaError } from './errors.js';

/**
 * Isolation-test OA adapter. Not a live OA system.
 * Enable only with `meetingOa.testAdapter` / `MEETING_OA_TEST_ADAPTER`.
 */
export class TestMeetingOaAdapter implements MeetingOaAdapter {
  readonly kind = 'test' as const;
  readonly writeContract = 'test' as const;
  people: OaPerson[] = [];
  tokenTtlMs = 60_000;
  createMeetingError: MeetingOaError | undefined;
  uploadSummaryError: MeetingOaError | undefined;
  createTaskError: MeetingOaError | undefined;
  taskResults: readonly OaTaskWriteResult[] | undefined;
  createMeetingCalls: FrozenOaPayload[] = [];
  uploadSummaryCalls: FrozenOaPayload[] = [];
  createTaskCalls: FrozenOaPayload[] = [];
  tokenCalls: string[] = [];
  searchCalls: string[] = [];
  private readonly tokenCache = new Map<
    string,
    { token: OaToken; fetchedAt: number }
  >();
  clock = () => Date.now();

  reset(): void {
    this.people = [
      {
        fd_no: 'E1001',
        fd_name: 'Alice',
        fd_department: 'Meeting',
      },
    ];
    this.tokenTtlMs = 60_000;
    this.createMeetingError = undefined;
    this.uploadSummaryError = undefined;
    this.createTaskError = undefined;
    this.taskResults = undefined;
    this.createMeetingCalls = [];
    this.uploadSummaryCalls = [];
    this.createTaskCalls = [];
    this.tokenCalls = [];
    this.searchCalls = [];
    this.tokenCache.clear();
    this.clock = () => Date.now();
  }

  async searchPeople(query: string): Promise<readonly OaPerson[]> {
    this.searchCalls.push(query);
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      throw new MeetingOaError(
        'INVALID_OA_QUERY',
        'OA people query must be at least 2 characters',
        'INVALID_ARGUMENT',
      );
    }
    return this.people.filter(
      (row) =>
        row.fd_name.toLowerCase().includes(q) ||
        row.fd_no.toLowerCase().includes(q),
    );
  }

  async getToken(employeeNo: string): Promise<OaToken> {
    this.tokenCalls.push(employeeNo);
    const cached = this.tokenCache.get(employeeNo);
    const now = this.clock();
    if (cached && Date.parse(cached.token.expiresAt) - 5_000 > now) {
      return cached.token;
    }
    const token: OaToken = {
      accessToken: `oa_test_${employeeNo}`,
      expiresAt: new Date(now + this.tokenTtlMs).toISOString(),
    };
    this.tokenCache.set(employeeNo, { token, fetchedAt: now });
    return token;
  }

  async createMeeting(
    _token: OaToken,
    payload: FrozenOaPayload,
  ): Promise<OaCreateMeetingResult> {
    this.createMeetingCalls.push(payload);
    if (this.createMeetingError) throw this.createMeetingError;
    return {
      externalMeetingId: `oa-meet-${payload.meeting.title.slice(0, 24)}`,
    };
  }

  async uploadSummary(
    _token: OaToken,
    payload: FrozenOaPayload,
    _externalMeetingId: string,
  ): Promise<OaUploadSummaryResult> {
    this.uploadSummaryCalls.push(payload);
    if (this.uploadSummaryError) throw this.uploadSummaryError;
    return { uploaded: true };
  }

  async createTaskByMeeting(
    _token: OaToken,
    payload: FrozenOaPayload,
    _externalMeetingId: string,
  ): Promise<readonly OaTaskWriteResult[]> {
    this.createTaskCalls.push(payload);
    if (this.createTaskError) throw this.createTaskError;
    if (this.taskResults) return this.taskResults;
    return payload.tasks.map((task) => ({
      clientTaskId: task.clientTaskId,
      status: 'succeeded' as const,
      externalTaskId: `oa-task-${task.clientTaskId}`,
      errorCode: null,
    }));
  }
}
