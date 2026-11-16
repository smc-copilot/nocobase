import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ...fileUi,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    meetings: 'Meetings',
  },
  home: {
    ...systemEnUS.home,
    platform: 'Meeting',
    title: 'Meetings in this application',
    description:
      'Bind the meeting gateway, query authorized meetings, edit local content, and prepare OA drafts. Live OA writes stay blocked until the published write contract is confirmed.',
  },
  meetings: {
    title: 'Meetings',
    empty:
      'No meetings stored for you yet. Query the bound gateway to import them.',
    untitled: 'Untitled meeting',
    notProvided: 'Not provided',
    loading: 'Loading…',
    unavailable: 'This meeting is unavailable.',
    listDescription: 'Stored meetings you are allowed to open.',
    queryNotConnected:
      'This list only shows meetings already stored for you. Use Query to call the bound gateway; opening the page does not sync by itself.',
    query: 'Query',
    queryStart: 'From',
    queryEnd: 'To',
    queryStarted: 'Query finished',
    queryFailed: 'The gateway query could not be completed.',
    detailDescription:
      'OA workspace is the default meeting detail. People, recordings, and the read-only Tencent source page stay on this meeting.',
    retry: 'Retry',
    summaryTitle: 'Tencent source materials',
    summaryDescription:
      'Read-only Tencent minutes groups and original/optimized dialogues. This page does not edit OA drafts.',
    summaryEmptyMinutes: 'No Tencent minutes in this group.',
    summaryEmptyDialogue: 'No Tencent dialogue in this tab.',
    summaryReadOnly:
      'Read-only source materials. Editing and tasks stay on the OA workspace.',
    meetingCodeLabel: 'Meeting number {{code}}',
    participantsEmpty: 'No participant rows are stored for this meeting.',
    recordingsEmpty: 'No recording rows are stored for this meeting.',
    recordingAvailable: 'Recording available',
    recordingUnavailable: 'Recording not available',
    department: 'Department',
    joinedAt: 'Joined',
    recordingFormat: 'Format',
    recordingReason: 'Unavailable reason',
    tabs: {
      overview: 'Overview',
      participants: 'People',
      recordings: 'Recordings',
      oa: 'OA workspace',
      summary: 'Tencent source',
    },
    summary: {
      deepseek: 'DeepSeek minutes',
      chapters: 'Section minutes',
      speaker: 'Speaker minutes',
      topic: 'Topic minutes',
      dialogues: 'Dialogue',
      original: 'Original',
      optimized: 'Optimized',
    },
    fetchStatus: {
      not_fetched: 'Not fetched yet',
      fetched: 'Fetched',
      empty: 'Upstream returned none',
      failed: 'Fetch failed; earlier rows were kept',
      not_provided: 'Not provided',
    },
    columns: {
      title: 'Name',
      meetingCode: 'Meeting number',
      createdAt: 'Created',
      startedAt: 'Started',
      endedAt: 'Ended',
      participants: 'People',
      recordings: 'Recordings',
    },
  },
  meetingConnections: {
    title: 'Meeting gateway',
    description:
      'Bind this application to your authorized Tencent meeting connections. Tokens stay on the server.',
    binding: 'Current binding',
    bind: 'Bind gateway',
    select: 'Use this connection',
    selected: 'Connection selected',
    disconnect: 'Disconnect this app',
    disconnected:
      'This app can no longer call the gateway with the old credential.',
    disconnectScope:
      'Disconnect stops later remote access from this application. It does not revoke the upstream Tencent or gateway grant; that revoke API is not supported here.',
    noConnection: 'No connection is selected yet.',
    currentConnection: 'Selected connection: {{name}}',
    notConfigured:
      'The meeting gateway origin and application are not configured. This app is not connected. Maintain the gateway server on Meeting integrations.',
    identityUnavailable:
      'The first gateway access token comes from account-login and token exchange in the published gateway client. This app does not collect a gateway password or a pasted token, so live OAuth start stays blocked until that contract is confirmed.',
    serverConfigLink: 'Maintain the meeting-gateway server',
    serverConfigHint:
      'User binding is separate from the gateway server settings. Saving server settings does not start OAuth.',
    rootUnrestricted:
      'A platform root (unrestricted) user can read every stored meeting. Ordinary administrators and members do not receive that bypass.',
    completing: 'Finishing gateway authorization…',
    status: {
      pending: 'Waiting for authorization',
      awaiting_connection: 'Choose an authorized connection',
      active: 'Connected',
      disconnected: 'Disconnected from this app',
      identity_unavailable: 'Gateway identity token is unavailable',
      not_configured: 'Gateway is not configured',
    },
  },
  meetingOa: {
    workspaceTitle: 'OA workspace',
    workspaceDescription:
      'Edit the local OA draft. Saving does not call OA. Formal sync is a separate command.',
    isolationBanner: 'Local test data, real OA was not called.',
    mappingMissing:
      'No trusted employee mapping. You can still save a valid draft; formal sync will write nothing to OA.',
    mappedAs: 'Signed-in identity maps to employee {{employeeNo}}.',
    importContractMissing:
      'Gateway recording download is not in the published client. Local content can still be edited.',
    importFailed:
      'Recording import failed. The local content row records the error; source text was not overwritten.',
    localMinutesKept:
      'Local minutes edits are kept separately from imported source text.',
    sourceTodos: 'Tencent source to-dos (not assigned OA tasks)',
    sourceTodosNotAssigned:
      'Source to-dos are not treated as assigned tasks until you add a draft task with an employee number.',
    peopleSearch: 'Search OA people',
    search: 'Search',
    peopleFailed: 'OA people search could not be completed.',
    peopleLoading: 'Searching people…',
    peopleEmpty: 'No matching people.',
    peopleNeedChars: 'Type at least two characters.',
    peopleErrorKept: 'Search failed. Selected people were kept.',
    peopleNotConfigured:
      'OA people search is not configured. Local users are not used instead.',
    peopleSourceHttp:
      'Organizer and host are single-select; attendees, actual attendees, copy-to and followers are multi-select. Candidates come from the OA people search URL saved in Meeting OA settings, through this app’s authorized proxy. This page does not call OA directly.',
    peopleSourceTest:
      'Organizer and host are single-select; attendees, actual attendees, copy-to and followers are multi-select. Candidates come from the local test OA people adapter. This is not a live OA people directory.',
    peopleUrlHint:
      'Each search reads the current saved people URL. An environment variable is used only when nothing is saved, and is labeled below. It never overrides a saved URL.',
    peopleUrlSourceSettings: 'Active source: saved OA settings',
    peopleUrlSourceEnv:
      'Active source: environment variable (no saved people URL)',
    peopleUrlSourceTest: 'Active source: local test adapter (not live OA)',
    peopleUrlSourceNone: 'People search is not configured',
    clearPerson: 'Clear',
    addTask: 'Add assigned task',
    deleteTask: 'Delete task',
    taskDialogTitle: 'Edit task content',
    taskDialogSave: 'Save content',
    taskDialogCancel: 'Cancel',
    refill: 'Refill from Tencent',
    refillConfirm:
      'Replace title, times, location, minutes and remark from Tencent. People, purpose and tasks stay.',
    refillFailed: 'Refill from Tencent could not be completed.',
    meetingCreated: 'OA meeting created',
    notFullyComplete:
      'Minutes or tasks are not complete. This is not fully done.',
    externalMeetingId: 'OA meeting id',
    externalSummaryId: 'OA summary id',
    liveVerified: 'Live OA verified: no',
    beijingHint: 'Times are edited as Beijing wall-clock and stored as ISO.',
    filesTitle: 'Supplemental files',
    filesCount: '{{count}} files, {{bytes}} bytes',
    filesHint:
      '{{bytes}} bytes used. Up to 20 files, 100 MB each, 500 MB per meeting.',
    filesImages: 'Images',
    filesList: 'Files',
    filesPending: 'Files to send',
    filesPreview: 'Preview {name}',
    filesViewNamed: 'View {name}',
    filesRemoveNamed: 'Remove {name}',
    filesUploading: 'Uploading {name}…',
    filesRemoveDescription: '“{name}” is deleted for this meeting.',
    filesPrevious: 'Previous file',
    filesNext: 'Next file',
    filesUpload: 'Upload supplemental file',
    filesView: 'View',
    filesRetry: 'Retry parse',
    filesDelete: 'Delete',
    filesDeleteConfirm: 'Delete this supplemental file?',
    filesFrozen:
      'Supplemental files are read-only after an OA operation exists.',
    filesFailed: 'Supplemental file action failed.',
    draftFrozen:
      'An OA operation already exists for this meeting. Draft fields stay read-only.',
    viewOperation: 'Open OA execution',
    filesTencentLocked: 'Tencent original materials cannot be deleted here.',
    saveDraft: 'Save draft',
    submitSync: 'Submit OA sync',
    saveWritesZeroOa: 'Saving a draft writes zero OA side effects.',
    draftSaved: 'Draft saved locally.',
    draftFailed: 'The draft could not be saved.',
    syncFailed: 'OA sync was not submitted.',
    operationTitle: 'OA execution',
    operationDescription:
      'GET is a pure read. UNKNOWN steps are not resent. Resume continues confirmed-unsent work. Recover is a separate command after reconcile marks not_sent.',
    liveWriteBlocked:
      'Live OA write HTTP is not published. This page shows the local execution ledger.',
    resume: 'Resume unsent steps',
    resumeFailed: 'This operation cannot be resumed.',
    reconciliationTitle: 'OA reconcile',
    reconciliationDescription:
      'Record evidence only. Reconcile never writes OA. Recovery is a separate command on the execution page and keeps the frozen creator and payload.',
    reconcileEmpty: 'No UNKNOWN or PARTIAL operations.',
    evidencePlaceholder: 'Evidence that the write was or was not sent',
    markNotSent: 'Mark not sent',
    markUnknown: 'Mark sent or unknown',
    recover: 'Recover frozen intent',
    reconcileSaved: 'Evidence recorded. OA was not written.',
    reconcileFailed: 'Evidence could not be recorded.',
    recoverFailed: 'Recovery could not continue.',
    integrationsTitle: 'Meeting integrations',
    integrationsDescription:
      'Maintain the OA server and the meeting-gateway server. User binding stays on Meeting gateway. Saving settings does not bind, query meetings or write OA.',
    tabOa: 'OA server',
    tabGateway: 'meeting-gateway server',
    writeContract: 'Write contract: {{value}}',
    hasSecret: 'Client secret: {{value}}',
    secretSealed: 'sealed',
    secretMissing: 'not stored',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved. The secret is not returned.',
    settingsFailed: 'Settings could not be saved.',
    mappingTitle: 'Trusted employee mapping',
    mappingHint:
      'Map a signed-in user to an OA employee number. Do not treat platform root as a default delegate.',
    mappingEmpty: 'No trusted employee mappings yet.',
    evidenceTitle: 'Reconcile evidence',
    externalId: 'External id',
    parseStatus: {
      succeeded: 'Parsed',
      failed: 'Parse failed',
      pending: 'Parsing',
    },
    saveMap: 'Save mapping',
    mapSaved: 'Mapping saved.',
    mapFailed: 'Mapping could not be saved.',
    fields: {
      title: 'Meeting title',
      purpose: 'Meeting purpose',
      remark: 'Remark',
      location: 'Location',
      startAt: 'Start (Beijing)',
      endAt: 'End (Beijing)',
      attendees: 'Attendees',
      emcee: 'Organizer',
      host: 'Host',
      otherAttendPerson: 'External attendees',
      summaryTitle: 'Minutes title',
      summary: 'Minutes to upload',
      summaryCompleteTime: 'Minutes completed at (Beijing)',
      time: 'Time',
      actualAttend: 'Actual attendees',
      copyTo: 'Minutes copy-to',
      inputPerson: 'Minutes recorder',
      taskIndex: 'No.',
      taskTitle: 'Assigned task title',
      taskContent: 'Task content',
      assignee: 'Assignee',
      dueAt: 'Due (Beijing)',
      appoint: 'Appointed by',
      attention: 'Followers',
      status: 'Status',
      requestId: 'Request id',
      creator: 'Frozen creator',
      steps: 'Steps',
      tasks: 'Task results',
      tokenUrl: 'Token URL',
      peopleUrl: 'People search URL',
      meetingUrl: 'OA meeting URL',
      viewUrl: 'OA view URL',
      scope: 'Token scope',
      clientId: 'Client id',
      clientSecret: 'Client secret (write-only)',
      userId: 'Local user id',
      employeeNo: 'OA employee number',
    },
  },
  meetingGatewaySettings: {
    title: 'meeting-gateway server',
    description:
      'Persist the gateway origin, application id, client identity and public callback origin. This is not user OAuth binding. Saving does not verify the connection.',
    savedNotVerified: 'Settings saved is not a live connection check.',
    localFormatOnly:
      'The page only checks HTTPS origin format locally. It does not call the gateway.',
    identityUnavailable:
      'Gateway identity token issuance is unavailable (GATEWAY_IDENTITY_TOKEN_UNAVAILABLE). clientId, client secret, resource and scopes are stored for that issuance and are not sent on save.',
    queryUnavailable:
      'HTTP queryMeetings and listParticipants are not implemented (upstream contract missing). Saving settings does not query meetings.',
    testAdapter:
      'Isolation test adapter is on for this process. It is a deployment switch, not a production-write control, and changing it here is not supported. Restart the process after changing MEETING_GATEWAY_TEST_ADAPTER.',
    httpAdapter:
      'This process uses the HTTP gateway adapter. Origin, application id and related fields are read at call time from saved settings, then env, then defaults.',
    originAllowlist:
      'Deployment origin allowlist (read-only). An admin-saved origin must already be in this list. Saving does not expand it.',
    authorizationPaths:
      'Deployment authorization path allowlist (read-only). Used when validating Tencent authorization URLs.',
    allowlistEmpty:
      'The deployment origin allowlist is empty, so a saved origin cannot be used until MEETING_GATEWAY_ORIGIN_ALLOWLIST (or config.yml) lists it.',
    sourceSettings: 'Currently used from saved settings',
    sourceEnv: 'Currently used from environment / config.yml (field not saved)',
    sourceNone: 'Not configured',
    runtimeOrigin: 'Origin in use: {{value}}',
    runtimeApplication: 'Application id in use: {{value}}',
    runtimeInstance: 'Instance id in use: {{value}}',
    runtimeConfigured: 'Runtime configured: {{value}}',
    yes: 'yes',
    no: 'no',
    hasSecret: 'Client secret: {{value}}',
    secretSealed: 'sealed (not echoed)',
    secretMissing: 'not stored',
    clearSecret: 'Clear the stored client secret',
    clearSecretHint:
      'Leave the secret blank to keep the current value. Check this box to remove it. Changing the secret does not request a token.',
    credentialVersion: 'Credential version {{value}}',
    bindPage: 'User binding and OAuth',
    saveSettings: 'Save gateway server',
    settingsSaved:
      'Gateway server settings saved. The secret is not returned. The connection was not verified.',
    settingsFailed: 'Gateway server settings could not be saved.',
    originHint:
      'HTTPS origin of meeting-gateway. Must already be in the deployment allowlist. http, credentials, paths and unsafe hosts are rejected.',
    applicationHint:
      'Gateway application_id used when starting authorization. Not the Tencent corp/sdk id.',
    clientIdHint:
      'Gateway OAuth client_id for identity-token issuance. Distinct from applicationId and from Tencent corp_id / sdk_id. Issuance is currently unavailable.',
    expectedHint:
      'Expected application_id on listed connections. Must equal applicationId when both are set.',
    resourceHint:
      'Token resource the unpublished identity exchange must return unchanged. Stored only; not sent on save.',
    scopesHint:
      'Space-separated gateway OAuth scopes for unpublished identity issuance. Stored only.',
    publicBaseHint:
      'Public origin of this App for the OAuth return path. This is not the gateway origin and does not change the deployment allowlist.',
    tencentHint:
      'Tencent corp_id, sdk_id and callback ref are used only to validate authorization URLs. They are not the gateway client identity.',
    instanceHint:
      'Stable instance id stored on meeting source keys and bindings. Changing it isolates old bindings; they are kept for history and are not reused.',
    fields: {
      origin: 'Gateway origin',
      applicationId: 'Application id',
      expectedApplicationId: 'Expected application id',
      clientId: 'Gateway client id',
      clientSecret: 'Gateway client secret (write-only)',
      resource: 'Token resource',
      scopes: 'Scopes',
      publicBaseUrl: 'Public callback origin',
      tencentCorpId: 'Tencent corp_id',
      tencentSdkId: 'Tencent sdk_id',
      callbackRef: 'Gateway callback ref',
      instanceId: 'Gateway instance id',
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
