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
  /** Upstream join_name when present; otherwise null. */
  readonly joinName: string | null;
  /** Upstream nickname when present; kept for displayName semantics. */
  readonly displayName: string | null;
  readonly department: string | null;
  readonly joinedAt: string | null;
  readonly jobTitle: string | null;
  readonly isCorpMember: boolean | null;
}

export type GatewayRecordingImportability =
  'importable' | 'unknown' | 'blocked';

export interface GatewayRecordingRecord {
  readonly recordFileId: string;
  readonly available: boolean;
  readonly format: string | null;
  readonly unavailableReason: string | null;
  readonly sharingUrl: string | null;
  readonly allowDownload: boolean | null;
  readonly importability: GatewayRecordingImportability;
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

export interface GatewayAuthorizationComplete {
  readonly tokenType: 'Bearer';
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly connectionId: string;
  readonly memberId: string;
  readonly connectionName: string | null;
  readonly connectionType: string | null;
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
    flowNonce?: string;
  }): Promise<GatewayAuthorizationStart>;
  completeAuthorization(input: {
    transactionId: string;
  }): Promise<GatewayAuthorizationComplete>;
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
  getRecordFileDetail?(input: {
    accessToken: string;
    connectionRef: string;
    recordFileId: string;
  }): Promise<GatewayRecordFileDetail>;
}

export interface GatewayRecordFileDocEntry {
  readonly fileType: string | null;
  readonly downloadUrl: string | null;
  readonly available: boolean;
}

export interface GatewayRecordFileInfoEntry {
  readonly userId: string | null;
  readonly topic: string | null;
  readonly startAt: string | null;
  readonly endAt: string | null;
}

export interface GatewayRecordFileDetail {
  readonly recordFileId: string;
  readonly viewAddress: string | null;
  readonly downloadAddress: string | null;
  readonly downloadAddressFileType: string | null;
  readonly audioAddress: string | null;
  readonly audioAddressFileType: string | null;
  readonly meetingSummary: readonly GatewayRecordFileDocEntry[];
  readonly aiMeetingTranscripts: readonly GatewayRecordFileDocEntry[];
  readonly aiMinutes: readonly GatewayRecordFileDocEntry[];
  readonly aiTopicMinutes: readonly GatewayRecordFileDocEntry[];
  readonly aiSpeakerMinutes: readonly GatewayRecordFileDocEntry[];
  readonly aiDsMinutes: readonly GatewayRecordFileDocEntry[];
  readonly recordInfo: readonly GatewayRecordFileInfoEntry[];
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
