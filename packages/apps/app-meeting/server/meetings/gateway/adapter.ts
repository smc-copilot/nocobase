export interface GatewayConnection {
  readonly connectionId: string;
  readonly applicationId: string;
  readonly name: string;
  readonly memberId: string;
  readonly type: string;
  readonly status: string;
}

export interface GatewayMeetingRecord {
  readonly upstreamMeetingId: string;
  readonly title: string | null;
  readonly meetingCode: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly organizationId: string;
  readonly connectionRef: string;
  readonly cycleKey: string;
}

export interface GatewayParticipantRecord {
  readonly upstreamParticipantId: string;
  readonly displayName: string | null;
  readonly department: string | null;
  readonly joinedAt: string | null;
}

export interface GatewayRecordingRecord {
  readonly recordFileId: string;
  readonly available: boolean;
  readonly format: string | null;
  readonly unavailableReason: string | null;
}

export interface GatewayQueryWindow {
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface GatewayAuthorizationStart {
  readonly authorizationUrl: string;
  readonly transactionId: string;
  readonly expiresAt: string;
}

export interface GatewayIdentityTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
  readonly resource: string;
  readonly scope: string;
  readonly member: {
    readonly gatewayInstanceId: string;
    readonly orgId: string;
    readonly memberId: string;
    readonly userId: string;
    readonly displayName: string | null;
  };
}

export interface MeetingGatewayAdapter {
  readonly kind: 'http' | 'test';
  startAuthorization(input: {
    accessToken: string;
    applicationId: string;
    returnTo: string;
  }): Promise<GatewayAuthorizationStart>;
  listConnections(input: {
    accessToken: string;
  }): Promise<readonly GatewayConnection[]>;
  confirmConnection(
    input: { accessToken: string },
    connectionId: string,
  ): Promise<GatewayConnection>;
  queryMeetings(input: {
    accessToken: string;
    connectionRef: string;
    memberId: string;
    window: GatewayQueryWindow;
  }): Promise<readonly GatewayMeetingRecord[]>;
  listParticipants(input: {
    accessToken: string;
    connectionRef: string;
    meetingId: string;
  }): Promise<readonly GatewayParticipantRecord[]>;
  listRecordings(input: {
    accessToken: string;
    connectionRef: string;
    meetingId: string;
  }): Promise<readonly GatewayRecordingRecord[]>;
  importRecordingContent?(input: {
    accessToken: string;
    connectionRef: string;
    recordFileId: string;
  }): Promise<readonly GatewayContentArtifact[]>;
}

export interface GatewayContentArtifact {
  readonly group:
    | 'meeting_summary'
    | 'ai_meeting_transcripts'
    | 'ai_minutes'
    | 'ai_topic_minutes'
    | 'ai_speaker_minutes'
    | 'ai_ds_minutes';
  readonly text: string;
}
