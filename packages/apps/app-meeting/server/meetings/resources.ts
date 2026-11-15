import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

export const MEETINGS = 'meetings';
export const MEETING_ACCESS = 'meetingAccess';
export const MEETING_GATEWAY_BINDINGS = 'meetingGatewayBindings';
export const MEETING_OAUTH_STATES = 'meetingOauthStates';
export const MEETING_QUERY_RUNS = 'meetingQueryRuns';
export const MEETING_PARTICIPANTS = 'meetingParticipants';
export const MEETING_RECORDINGS = 'meetingRecordings';

export const MEETING_RESOURCE = 'meeting';
export const MEETING_GRANTED_ACCESS = 'meeting.granted';
export const MEETING_OWN_BINDINGS_ACCESS = 'meeting.ownBindings';
export const MEETING_OWN_QUERY_RUNS_ACCESS = 'meeting.ownQueryRuns';
export const MEETINGS_PAGE = 'meetings';
export const MEETING_CONNECTIONS_PAGE = 'meeting-connections';

export const GATEWAY_SECRET_PURPOSE = 'app-meeting.gateway-access';

export type FetchStatus =
  'not_fetched' | 'fetched' | 'empty' | 'failed' | 'not_provided';

export type GatewayBindingStatus =
  | 'pending'
  | 'awaiting_connection'
  | 'active'
  | 'disconnected'
  | 'identity_unavailable'
  | 'not_configured';

export type QueryRunStatus = 'running' | 'succeeded' | 'failed' | 'empty';

export interface Meeting {
  id: string;
  title: string | null;
  meetingCode: string | null;
  sourceGatewayInstance: string;
  sourceOrganization: string;
  sourceConnectionRef: string;
  sourceUpstreamMeetingId: string;
  sourceCycleKey: string;
  startedAt: Date | null;
  endedAt: Date | null;
  participantFetchStatus: FetchStatus;
  recordingFetchStatus: FetchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingAccess {
  id: string;
  meetingId: string;
  userId: string;
  canRead: boolean;
  canWrite: boolean;
}

export interface MeetingGatewayBinding {
  id: string;
  userId: string;
  status: GatewayBindingStatus;
  gatewayInstanceId: string;
  organizationId: string | null;
  gatewayMemberId: string | null;
  connectionRef: string | null;
  connectionName: string | null;
  connectionType: string | null;
  credentialVersion: number;
  sealedAccessToken: string | null;
  sealedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  disconnectRevokesUpstream: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOauthState {
  id: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  transactionId: string | null;
  sealedAccessToken: string | null;
  returnTo: string;
  createdAt: Date;
}

export interface MeetingQueryRun {
  id: string;
  userId: string;
  bindingId: string;
  connectionRef: string;
  memberId: string;
  startedAt: Date;
  endedAt: Date;
  status: QueryRunStatus;
  errorReason: string | null;
  meetingCount: number | null;
  startedAtClock: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  upstreamParticipantId: string;
  displayName: string | null;
  department: string | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingRecording {
  id: string;
  meetingId: string;
  recordFileId: string;
  available: boolean;
  format: string | null;
  unavailableReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const meetingPublicFields = [
  'id',
  'title',
  'meetingCode',
  'startedAt',
  'endedAt',
  'participantFetchStatus',
  'recordingFetchStatus',
  'createdAt',
] as const;

export const meetingGrantedAccess = defineRecordAccess(
  MEETING_GRANTED_ACCESS,
  (access) =>
    access
      .title('Meetings granted to me')
      .collections(MEETINGS)
      .resolver(() => false),
);

export const meetingOwnBindingsAccess = defineRecordAccess(
  MEETING_OWN_BINDINGS_ACCESS,
  (access) =>
    access
      .title('My meeting gateway bindings')
      .collections(MEETING_GATEWAY_BINDINGS)
      .resolver(() => false),
);

export const meetingOwnQueryRunsAccess = defineRecordAccess(
  MEETING_OWN_QUERY_RUNS_ACCESS,
  (access) =>
    access
      .title('My meeting query runs')
      .collections(MEETING_QUERY_RUNS)
      .resolver(() => false),
);

const meetingData = defineDatabasePermission((permission) =>
  permission
    .collection<Meeting>(MEETINGS)
    .read([...meetingPublicFields])
    .options(meetingGrantedAccess.reference()),
);

const bindingData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingGatewayBinding>(MEETING_GATEWAY_BINDINGS)
    .read([
      'id',
      'status',
      'connectionRef',
      'connectionName',
      'connectionType',
      'gatewayMemberId',
      'updatedAt',
    ])
    .create(['id', 'status'])
    .update(['status', 'connectionRef', 'connectionName', 'connectionType'])
    .options(meetingOwnBindingsAccess.reference()),
);

const queryRunData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingQueryRun>(MEETING_QUERY_RUNS)
    .read([
      'id',
      'status',
      'startedAt',
      'endedAt',
      'errorReason',
      'meetingCount',
      'finishedAt',
      'createdAt',
    ])
    .create(['id', 'status', 'startedAt', 'endedAt'])
    .options(meetingOwnQueryRunsAccess.reference()),
);

export const meetingResource = defineCompositeResource(MEETING_RESOURCE, (r) =>
  r
    .title('Meetings')
    .action('read', (action) =>
      action.title('Read meetings').grant('meetings', meetingData),
    )
    .action('manageConnections', (action) =>
      action
        .title('Manage own meeting gateway connections')
        .grant('meetingGatewayBindings', bindingData),
    )
    .action('query', (action) =>
      action
        .title('Query meetings from the bound gateway')
        .grant('meetingQueryRuns', queryRunData),
    ),
);
