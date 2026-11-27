import { MeetingGatewayError } from './errors.js';
import type {
  GatewayAuthorizationComplete,
  GatewayAuthorizationStart,
  GatewayConnection,
  GatewayContentArtifact,
  GatewayMeetingRecord,
  GatewayParticipantRecord,
  GatewayRecordFileDetail,
  GatewayRecordingRecord,
  MeetingGatewayAdapter,
} from './adapter.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXED_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_MEMBER_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Isolation-test adapter. It is not a live gateway and must not be enabled
 * outside tests (`meetingGateway.testAdapter`).
 */
export class TestMeetingGatewayAdapter implements MeetingGatewayAdapter {
  readonly kind = 'test' as const;
  accessTokens = new Set<string>(['mt_test_token']);
  connections: GatewayConnection[] = [];
  meetings: GatewayMeetingRecord[] = [];
  participants = new Map<string, GatewayParticipantRecord[]>();
  recordings = new Map<string, GatewayRecordingRecord[]>();
  recordFileDetails = new Map<string, GatewayRecordFileDetail>();
  artifacts = new Map<string, GatewayContentArtifact[]>();
  queryError: MeetingGatewayError | undefined;
  participantError: MeetingGatewayError | undefined;
  recordingError: MeetingGatewayError | undefined;
  importError: Error | undefined = undefined;
  queryCalls: unknown[] = [];
  startCalls: unknown[] = [];

  reset(): void {
    this.accessTokens = new Set(['mt_test_token']);
    this.connections = [];
    this.meetings = [];
    this.participants = new Map();
    this.recordings = new Map();
    this.recordFileDetails = new Map();
    this.artifacts = new Map();
    this.queryError = undefined;
    this.participantError = undefined;
    this.recordingError = undefined;
    this.importError = undefined;
    this.queryCalls = [];
    this.startCalls = [];
  }

  private requireToken(accessToken: string): void {
    if (!this.accessTokens.has(accessToken)) {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'The stored gateway credential is no longer valid.',
        'FAILED_PRECONDITION',
      );
    }
  }

  async startAuthorization(input: {
    accessToken: string;
    applicationId: string;
    returnTo: string;
    flowNonce?: string;
  }): Promise<GatewayAuthorizationStart> {
    this.requireToken(input.accessToken);
    this.startCalls.push(input);
    return {
      authorizationUrl: `https://meeting.tencent.com/marketplace/authorize.html?corp_id=corp&sdk_id=sdk&redirect_uri=${encodeURIComponent(input.returnTo)}&state=test`,
      transactionId: 'txn-test',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async completeAuthorization(input: {
    transactionId: string;
  }): Promise<GatewayAuthorizationComplete> {
    if (!input.transactionId.trim()) {
      throw new MeetingGatewayError(
        'OAUTH_STATE_INVALID',
        'The OAuth transaction is missing.',
        'FAILED_PRECONDITION',
      );
    }
    const active = this.connections.find((item) => item.status === 'ACTIVE');
    const connectionId =
      active && UUID_PATTERN.test(active.connectionId)
        ? active.connectionId
        : FIXED_CONNECTION_ID;
    const memberId =
      active && UUID_PATTERN.test(active.memberId)
        ? active.memberId
        : FIXED_MEMBER_ID;
    const accessToken = 'mt_test_token';
    this.accessTokens.add(accessToken);
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: 3600,
      connectionId,
      memberId,
      connectionName: active?.name ?? 'Test connection',
      connectionType: active?.type ?? 'THIRD_PARTY_OAUTH',
    };
  }

  async listConnections(input: {
    accessToken: string;
  }): Promise<readonly GatewayConnection[]> {
    this.requireToken(input.accessToken);
    return this.connections;
  }

  async confirmConnection(
    input: { accessToken: string },
    connectionId: string,
  ): Promise<GatewayConnection> {
    this.requireToken(input.accessToken);
    const found = this.connections.find(
      (item) => item.connectionId === connectionId,
    );
    if (!found) {
      throw new MeetingGatewayError(
        'CONNECTION_NOT_ALLOWED',
        'The connection is not in the caller’s authorized set.',
        'FAILED_PRECONDITION',
      );
    }
    const confirmed = { ...found, status: 'ACTIVE' };
    this.connections = this.connections.map((item) =>
      item.connectionId === connectionId ? confirmed : item,
    );
    return confirmed;
  }

  async queryMeetings(input: {
    accessToken: string;
    connectionRef: string;
    memberId: string;
    window: { startedAt: string; endedAt: string };
  }): Promise<readonly GatewayMeetingRecord[]> {
    this.requireToken(input.accessToken);
    this.queryCalls.push(input);
    if (this.queryError) throw this.queryError;
    return this.meetings.filter(
      (item) => item.connectionRef === input.connectionRef,
    );
  }

  async listParticipants(input: {
    accessToken: string;
    connectionRef: string;
    meetingId: string;
  }): Promise<readonly GatewayParticipantRecord[]> {
    this.requireToken(input.accessToken);
    if (this.participantError) throw this.participantError;
    return this.participants.get(input.meetingId) ?? [];
  }

  async listRecordings(input: {
    accessToken: string;
    connectionRef: string;
    meetingId: string;
  }): Promise<readonly GatewayRecordingRecord[]> {
    this.requireToken(input.accessToken);
    if (this.recordingError) throw this.recordingError;
    return this.recordings.get(input.meetingId) ?? [];
  }

  async getRecordFileDetail(input: {
    accessToken: string;
    connectionRef: string;
    recordFileId: string;
  }): Promise<GatewayRecordFileDetail> {
    this.requireToken(input.accessToken);
    const detail = this.recordFileDetails.get(input.recordFileId);
    if (!detail) {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'The record file detail was not found.',
        'NOT_FOUND',
      );
    }
    return detail;
  }

  async importRecordingContent(input: {
    accessToken: string;
    connectionRef: string;
    recordFileId: string;
  }): Promise<readonly GatewayContentArtifact[]> {
    this.requireToken(input.accessToken);
    if (this.importError) throw this.importError;
    return (
      this.artifacts.get(input.recordFileId) ?? [
        {
          group: 'meeting_summary',
          text: 'ORIGINAL_ONLY isolation dialogue',
        },
        {
          group: 'ai_meeting_transcripts',
          text: 'OPTIMIZED_ONLY isolation dialogue',
        },
        {
          group: 'ai_ds_minutes',
          text: '## 会议摘要\nIsolation minutes body\n## 待办事项\n- Isolation source todo',
        },
      ]
    );
  }
}
