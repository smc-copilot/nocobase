import { MeetingGatewayError } from './errors.js';
import type {
  GatewayAuthorizationStart,
  GatewayConnection,
  GatewayContentArtifact,
  GatewayMeetingRecord,
  GatewayParticipantRecord,
  GatewayRecordingRecord,
  MeetingGatewayAdapter,
} from './adapter.js';

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
  artifacts = new Map<string, GatewayContentArtifact[]>();
  queryError: MeetingGatewayError | undefined;
  participantError: MeetingGatewayError | undefined;
  recordingError: MeetingGatewayError | undefined;
  importError: Error | undefined = undefined;
  listConnectionsError: MeetingGatewayError | undefined;
  listConnectionsHook:
    ((input: { accessToken: string }) => Promise<void>) | undefined;
  queryCalls: unknown[] = [];
  startCalls: unknown[] = [];

  reset(): void {
    this.accessTokens = new Set(['mt_test_token']);
    this.connections = [];
    this.meetings = [];
    this.participants = new Map();
    this.recordings = new Map();
    this.artifacts = new Map();
    this.queryError = undefined;
    this.participantError = undefined;
    this.recordingError = undefined;
    this.importError = undefined;
    this.listConnectionsError = undefined;
    this.listConnectionsHook = undefined;
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
  }): Promise<GatewayAuthorizationStart> {
    this.requireToken(input.accessToken);
    this.startCalls.push(input);
    return {
      authorizationUrl: `https://meeting.tencent.com/oauth?state=test&corp_id=corp&sdk_id=sdk&redirect_uri=${encodeURIComponent(input.returnTo)}`,
      transactionId: 'txn-test',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async listConnections(input: {
    accessToken: string;
  }): Promise<readonly GatewayConnection[]> {
    this.requireToken(input.accessToken);
    if (this.listConnectionsHook) await this.listConnectionsHook(input);
    if (this.listConnectionsError) throw this.listConnectionsError;
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
