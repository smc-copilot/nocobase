import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

export const MEETINGS = 'meetings';
export const MEETING_ACCESS = 'meetingAccess';
export const MEETING_GATEWAY_BINDINGS = 'meetingGatewayBindings';
export const MEETING_GATEWAY_SETTINGS = 'meetingGatewaySettings';
export const MEETING_OAUTH_STATES = 'meetingOauthStates';
export const MEETING_QUERY_RUNS = 'meetingQueryRuns';
export const MEETING_PARTICIPANTS = 'meetingParticipants';
export const MEETING_RECORDINGS = 'meetingRecordings';
export const MEETING_CONTENTS = 'meetingContents';
export const MEETING_IMPORT_RUNS = 'meetingImportRuns';
export const MEETING_OA_SETTINGS = 'meetingOaSettings';
export const MEETING_OA_EMPLOYEE_MAPS = 'meetingOaEmployeeMaps';
export const MEETING_OA_DELEGATIONS = 'meetingOaDelegations';
export const MEETING_OA_DRAFTS = 'meetingOaDrafts';
export const MEETING_OA_DRAFT_TASKS = 'meetingOaDraftTasks';
export const MEETING_OA_OPERATIONS = 'meetingOaOperations';
export const MEETING_OA_STEPS = 'meetingOaSteps';
export const MEETING_OA_TASK_RESULTS = 'meetingOaTaskResults';
export const MEETING_OA_OUTBOX = 'meetingOaOutbox';
export const MEETING_OA_RECONCILE_RECORDS = 'meetingOaReconcileRecords';
export const MEETING_SUPPLEMENTAL_FILES = 'meetingSupplementalFiles';
export const MEETING_TRANSCRIPT_REPAIRS = 'meetingTranscriptRepairs';
export const MEETING_AUDIT_EVENTS = 'meetingAuditEvents';

export const MEETING_RESOURCE = 'meeting';
export const MEETING_GRANTED_ACCESS = 'meeting.granted';
export const MEETING_OWN_BINDINGS_ACCESS = 'meeting.ownBindings';
export const MEETING_OWN_QUERY_RUNS_ACCESS = 'meeting.ownQueryRuns';
export const MEETINGS_PAGE = 'meetings';
export const MEETING_CONNECTIONS_PAGE = 'meeting-connections';
export const MEETING_INTEGRATIONS_PAGE = 'meeting-integrations';
export const MEETING_RECONCILIATION_PAGE = 'meeting-reconciliation';
export const MEETING_OPERATIONS_PAGE = 'meeting-operations';

export const GATEWAY_SECRET_PURPOSE = 'app-meeting.gateway-access';
export const GATEWAY_SETTINGS_PURPOSE = 'app-meeting.gateway-settings';
export const OA_SECRET_PURPOSE = 'app-meeting.oa-client';

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

export type ImportRunStatus = 'running' | 'succeeded' | 'failed';

export type OaMapStatus = 'active' | 'revoked';

export type OaDelegationStatus = 'active' | 'revoked';

export type OaOperationStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed_confirmed'
  | 'unknown'
  | 'partial'
  | 'blocked';

export type OaStepStatus =
  'pending' | 'in_flight' | 'succeeded' | 'failed_confirmed' | 'unknown';

export type OaTaskResultStatus =
  'pending' | 'succeeded' | 'failed_confirmed' | 'unknown';

export interface MeetingSourceTodo {
  title: string;
  description: string;
}

export type MeetingOaAction =
  | 'read'
  | 'viewRecording'
  | 'manageConnections'
  | 'query'
  | 'import'
  | 'edit'
  | 'oaDraftEdit'
  | 'oaSync'
  | 'oaResume'
  | 'oaReconcile'
  | 'identityManage'
  | 'supplement';

export type MeetingImportState =
  'not_imported' | 'importing' | 'imported' | 'failed';

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
  queryAnomaly: string | null;
  importState: MeetingImportState;
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
  joinName: string | null;
  displayName: string | null;
  department: string | null;
  joinedAt: Date | null;
  jobTitle: string | null;
  isCorpMember: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RecordingImportability = 'importable' | 'unknown' | 'blocked';

export interface MeetingRecording {
  id: string;
  meetingId: string;
  recordFileId: string;
  available: boolean;
  format: string | null;
  unavailableReason: string | null;
  sharingUrl: string | null;
  allowDownload: boolean | null;
  importability: RecordingImportability;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingPersonSnapshot {
  fd_no: string;
  fd_name: string;
  fd_department: string;
}

export interface MeetingContent {
  id: string;
  meetingId: string;
  contentVersion: number;
  sourceHash: string | null;
  originalTranscript: string | null;
  optimizedTranscript: string | null;
  minutesAiDs: string | null;
  minutesAi: string | null;
  minutesTopic: string | null;
  minutesSpeaker: string | null;
  localMinutes: string | null;
  localTranscript: string | null;
  localMinutesEdited: boolean;
  localTranscriptEdited: boolean;
  sourceTodos: MeetingSourceTodo[] | null;
  transcriptProvenance: Record<string, unknown> | null;
  importStatus: string;
  lastImportError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingTranscriptRepair {
  id: string;
  meetingId: string;
  contentId: string;
  action: string;
  reason: string;
  createdAt: Date;
}

export interface MeetingSupplementalFile {
  id: string;
  meetingId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  storageKey: string;
  parseStatus: string;
  parseError: string | null;
  parsedText: string | null;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingImportRun {
  id: string;
  meetingId: string;
  recordFileId: string;
  status: ImportRunStatus;
  progress: number;
  errorCode: string | null;
  sourceHash: string | null;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingGatewaySettings {
  id: string;
  enabled: boolean | null;
  origin: string | null;
  resource: string | null;
  instanceId: string | null;
  allowedOrigin: string | null;
  contractRevision: string | null;
  sealedContractSha256: string | null;
  sealedBridgeHmacKey: string | null;
  sealedBridgeKeyringJson: string | null;
  credentialVersion: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaSettings {
  id: string;
  tokenUrl: string | null;
  peopleUrl: string | null;
  meetingUrl: string | null;
  viewUrl: string | null;
  scope: string | null;
  clientId: string | null;
  sealedClientSecret: string | null;
  credentialVersion: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaEmployeeMap {
  id: string;
  userId: string;
  employeeNo: string;
  displayName: string | null;
  status: OaMapStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaDelegation {
  id: string;
  principalUserId: string;
  delegateUserId: string;
  status: OaDelegationStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaDraft {
  id: string;
  meetingId: string;
  version: number;
  title: string | null;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  purpose: string | null;
  remark: string | null;
  otherAttendPerson: string | null;
  attendeeEmployeeNos: string[] | null;
  attendeeSnapshots: MeetingPersonSnapshot[] | null;
  emceeSnapshot: MeetingPersonSnapshot | null;
  hostSnapshot: MeetingPersonSnapshot | null;
  actualAttendSnapshots: MeetingPersonSnapshot[] | null;
  copyToSnapshots: MeetingPersonSnapshot[] | null;
  summaryTitle: string | null;
  summary: string | null;
  summaryCompleteTime: string | null;
  filledFromContentVersion: number | null;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaDraftTask {
  id: string;
  draftId: string;
  clientTaskId: string;
  title: string;
  assigneeEmployeeNo: string | null;
  assigneeName: string | null;
  appointEmployeeNo: string | null;
  appointName: string | null;
  attentionEmployeeNos: string[] | null;
  attentionSnapshots: MeetingPersonSnapshot[] | null;
  startAt: string | null;
  dueAt: string | null;
  description: string | null;
  fromSourceTodo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaOperation {
  id: string;
  meetingId: string;
  oaTarget: string;
  requestId: string;
  status: OaOperationStatus;
  draftVersion: number;
  frozenPayload: Record<string, unknown>;
  creatorUserId: string;
  creatorEmployeeNo: string;
  actorUserId: string;
  denyReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaStep {
  id: string;
  operationId: string;
  stepKey: string;
  sequence: number;
  status: OaStepStatus;
  externalId: string | null;
  errorCode: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaTaskResult {
  id: string;
  operationId: string;
  clientTaskId: string;
  status: OaTaskResultStatus;
  externalTaskId: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaOutbox {
  id: string;
  operationId: string;
  wakeStatus: 'idle' | 'pending';
  leaseVersion: number;
  leaseUntil: Date | null;
  leaseOwner: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOaReconcileRecord {
  id: string;
  operationId: string;
  conclusion: 'not_sent' | 'sent_or_unknown' | 'external_confirmed';
  evidence: string;
  createdBy: string;
  createdAt: Date;
}

export const meetingPublicFields = [
  'id',
  'title',
  'meetingCode',
  'startedAt',
  'endedAt',
  'participantFetchStatus',
  'recordingFetchStatus',
  'queryAnomaly',
  'importState',
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

const gatewaySettingsData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingGatewaySettings>(MEETING_GATEWAY_SETTINGS)
    .read([
      'id',
      'enabled',
      'origin',
      'resource',
      'instanceId',
      'allowedOrigin',
      'contractRevision',
      'sealedContractSha256',
      'sealedBridgeHmacKey',
      'sealedBridgeKeyringJson',
      'credentialVersion',
      'updatedAt',
    ])
    .create([
      'id',
      'enabled',
      'origin',
      'resource',
      'instanceId',
      'allowedOrigin',
      'contractRevision',
      'sealedContractSha256',
      'sealedBridgeHmacKey',
      'sealedBridgeKeyringJson',
      'credentialVersion',
      'updatedBy',
      'createdAt',
      'updatedAt',
    ])
    .update([
      'enabled',
      'origin',
      'resource',
      'instanceId',
      'allowedOrigin',
      'contractRevision',
      'sealedContractSha256',
      'sealedBridgeHmacKey',
      'sealedBridgeKeyringJson',
      'credentialVersion',
      'updatedBy',
      'updatedAt',
    ]),
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

const contentData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingContent>(MEETING_CONTENTS)
    .read(['id', 'meetingId', 'contentVersion', 'importStatus'])
    .create(['id', 'meetingId', 'importStatus'])
    .update(['contentVersion', 'importStatus']),
);

const importRunData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingImportRun>(MEETING_IMPORT_RUNS)
    .read(['id', 'meetingId', 'status', 'progress', 'errorCode'])
    .create(['id', 'meetingId', 'status']),
);

const draftData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingOaDraft>(MEETING_OA_DRAFTS)
    .read(['id', 'meetingId', 'version', 'title'])
    .create(['id', 'meetingId', 'version'])
    .update(['version', 'title', 'summary']),
);

const operationData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingOaOperation>(MEETING_OA_OPERATIONS)
    .read(['id', 'meetingId', 'status', 'requestId'])
    .create(['id', 'meetingId', 'status', 'requestId']),
);

const identityData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingOaEmployeeMap>(MEETING_OA_EMPLOYEE_MAPS)
    .read(['id', 'userId', 'employeeNo', 'status'])
    .create(['id', 'userId', 'employeeNo', 'status'])
    .update(['employeeNo', 'status']),
);

const reconcileData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingOaReconcileRecord>(MEETING_OA_RECONCILE_RECORDS)
    .read(['id', 'operationId', 'conclusion', 'createdAt'])
    .create(['id', 'operationId', 'conclusion', 'evidence']),
);

const supplementalData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
    .read(['id', 'meetingId', 'fileName', 'sizeBytes', 'parseStatus'])
    .create(['id', 'meetingId', 'fileName', 'sizeBytes'])
    .update(['parseStatus', 'parseError'])
    .delete(),
);

const transcriptRepairData = defineDatabasePermission((permission) =>
  permission
    .collection<MeetingTranscriptRepair>(MEETING_TRANSCRIPT_REPAIRS)
    .read(['id', 'meetingId', 'contentId', 'action', 'reason', 'createdAt'])
    .create(['id', 'meetingId', 'contentId', 'action', 'reason']),
);

export const meetingResource = defineCompositeResource(MEETING_RESOURCE, (r) =>
  r
    .title('Meetings')
    .action('read', (action) =>
      action
        .title('Read meetings')
        .grant('meetings', meetingData)
        .grant('meetingTranscriptRepairs', transcriptRepairData),
    )
    .action('viewRecording', (action) =>
      action
        .title('View recording detail for preview')
        // The composite builder rejects an action that grants nothing.
        // Default the same granted-meeting read the caller already has so
        // `viewRecording: {}` does not open every meeting.
        .grant(
          'meetings',
          meetingData.default(meetingGrantedAccess.reference()),
        ),
    )
    .action('manageConnections', (action) =>
      action
        .title('Manage own meeting gateway connections')
        .grant('meetingGatewayBindings', bindingData)
        .grant('meetingGatewaySettings', gatewaySettingsData),
    )
    .action('query', (action) =>
      action
        .title('Query meetings from the bound gateway')
        .grant('meetingQueryRuns', queryRunData),
    )
    .action('import', (action) =>
      action
        .title('Import selected recording content')
        .grant('meetingImportRuns', importRunData)
        .grant('meetingContents', contentData)
        .grant('meetingTranscriptRepairs', transcriptRepairData),
    )
    .action('edit', (action) =>
      action
        .title('Edit local meeting content')
        .grant('meetingContents', contentData),
    )
    .action('oaDraftEdit', (action) =>
      action
        .title('Edit OA drafts without writing OA')
        .grant('meetingOaDrafts', draftData),
    )
    .action('oaSync', (action) =>
      action
        .title('Submit a frozen OA sync intent')
        .grant('meetingOaOperations', operationData),
    )
    .action('oaResume', (action) =>
      action
        .title('Resume an OA operation that is confirmed unsent')
        .grant('meetingOaOperations', operationData),
    )
    .action('oaReconcile', (action) =>
      action
        .title('Record OA reconcile evidence without writing OA')
        .grant('meetingOaReconcileRecords', reconcileData),
    )
    .action('identityManage', (action) =>
      action
        .title('Manage trusted OA employee mappings')
        .grant('meetingOaEmployeeMaps', identityData),
    )
    .action('supplement', (action) =>
      action
        .title('Manage restricted meeting supplemental files')
        .grant('meetingSupplementalFiles', supplementalData),
    ),
);
