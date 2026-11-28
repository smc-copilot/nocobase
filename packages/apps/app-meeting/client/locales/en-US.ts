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
  settings: {
    ...systemEnUS.settings,
    usernameHint:
      'Used to sign in. 3–30 characters: letters in any language, digits, underscores, dots, or hyphens.',
    invalidUsername:
      'Username must be 3–30 characters: letters, digits, underscores, dots, or hyphens.',
    staleAttempt:
      'The previous attempt did not finish, so this form was locked. It is released now. Submit again.',
  },
  home: {
    ...systemEnUS.home,
    platform: 'Meeting',
    title: 'Meetings in this application',
    description:
      'Bind the meeting gateway, query authorized meetings, edit local content, and prepare OA drafts. Live OA writes stay blocked until the published write contract is confirmed.',
  },
  meetingCasdoor: {
    providerLabel: 'Casdoor',
    signInFailed:
      'Casdoor sign-in could not be completed. Try again or sign in with your password.',
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
      'The list below shows stored meetings you can open now. Sign in and use Query only to sync new meetings from the gateway.',
    gatewayNotConfigured:
      'The meeting gateway is not configured yet, so login and query stay disabled.',
    loginTencent: 'Sign in to Tencent Meeting',
    loggedIn: 'Signed in',
    logout: 'Sign out',
    loginHint:
      'Sign in to sync new meetings from Tencent by time range. Stored meetings are listed below without signing in.',
    loginFailed:
      'Meeting gateway authorization could not start. Check the server configuration and try again.',
    loginCompleteFailed: 'Sign-in could not be completed. Try again.',
    query: 'Query',
    queryStart: 'From',
    queryEnd: 'To',
    queryStarted: 'Query finished',
    queryFailed: 'The gateway query could not be completed.',
    queryRetryLater:
      'The online meeting query is not finished yet. Try again later.',
    queryWindowInvalid: 'The start time must not be after the end time.',
    import: 'Import',
    importing: 'Importing',
    imported: 'Imported',
    oaMeetingCreated: 'OA meeting created',
    viewMeeting: 'View',
    importTasks: 'Import tasks',
    importPickTitle: 'Choose a recording (meeting {{code}})',
    importPickHint: 'Import only one file at a time.',
    importConfirm: 'Import the selected file',
    importNoFiles: 'No importable recordings yet.',
    importRecheck: 'Check again',
    importWait: 'A recording is already importing. Wait for it to finish.',
    allowDownloadYes: 'Yes',
    allowDownloadNo: 'No',
    allowDownloadUnknown: 'Unknown',
    importabilityImportable: 'Importable',
    importabilityUnknown: 'Permission unknown; you can continue',
    importabilityBlocked: 'Not importable',
    na: 'N/A',
    corpMemberYes: 'Yes',
    corpMemberNo: 'No',
    participantsTitle: 'Participants',
    jobTitle: 'Job title',
    corpMember: 'Internal member',
    taskCreated: 'Created',
    taskRunning: 'Running',
    taskSucceeded: 'Completed',
    taskFailed: 'Failed',
    taskRetry: 'Retry',
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
    viewParticipants: 'View',
    viewParticipantsTitle: 'Participants · {{title}} · {{code}}',
    participantsUnavailable: 'Fetch failed or no participants',
    participantsLoading: 'Loading participants…',
    participantsFailed: 'Participants could not be loaded.',
    joinName: 'Join name',
    status: 'Status',
    actions: 'Actions',
    viewRecordings: 'View recordings',
    recordingDetails: 'Recording details',
    recordingListTitle: 'Recordings · {{code}}',
    viewDetail: 'View details',
    openSharing: 'Open sharing page',
    cancel: 'Cancel',
    openTencentRecording: 'Open Tencent recording',
    downloadMedia: 'Download media',
    openAudio: 'Open audio',
    downloadDocument: 'Download document',
    refreshDetail: 'Refresh details',
    noRecordInfo: 'No recording information.',
    noDownloadableFiles: 'No downloadable files.',
    formatNotProvided: 'Format not provided',
    importingFileHint: 'The file to import is {{recordFileId}}.',
    mediaSection: 'Media files',
    documentsSection: 'Documents',
    recordInfoSection: 'Recording information',
    docMeetingSummary: 'Recording transcript',
    docAiTranscripts: 'AI meeting transcripts',
    docAiMinutes: 'AI minutes',
    docTopicMinutes: 'Topic minutes',
    docSpeakerMinutes: 'Speaker minutes',
    docDsMinutes: 'DeepSeek minutes',
    recordInfoUserId: 'User ID',
    recordInfoTopic: 'Topic',
    recordInfoStart: 'Start',
    recordInfoEnd: 'End',
    recordingAvailable: 'Recording available',
    recordingUnavailable: 'Recording not available',
    department: 'Department',
    joinedAt: 'Join time',
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
      searchPlaceholder: 'Search keyword',
      searchPrev: 'Previous match',
      searchNext: 'Next match',
      searchMatches: '{{current}} / {{total}}',
      searchNoMatch: 'No matches',
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
      participants: 'Participants',
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
    enabledLabel: 'Enable gateway',
    resourceLabel: 'REST resource',
    instanceLabel: 'Gateway instance',
    allowedOriginLabel: 'Application origin',
    allowedOriginHint:
      'No user, path, query, or fragment. The return address is this origin plus /meetings/done.',
    revisionLabel: 'Contract revision',
    shaLabel: 'Contract hash',
    hmacLabel: 'Bridge HMAC key',
    keyringLabel: 'Bridge keyring JSON',
    secretKept: 'Stored on the server. Leave blank to keep it.',
    secretMissing:
      'Not stored yet. It stays on the server and is not shown again.',
    originTitle: 'Gateway setup',
    originDescription:
      'Administrators set the HTTPS address of the meeting gateway. Tokens stay on the server.',
    originLabel: 'Connection address',
    originHint:
      'Use a public https origin with no path, such as https://gateway.example.com.',
    saveOrigin: 'Save address',
    originSaved: 'Gateway address saved',
    originMissing:
      'The meeting gateway address is not set. Enter it above to connect this application.',
    originSourceSettings: 'This address is the one saved on this page.',
    originSourceEnv:
      'This address comes from the server environment. Saving replaces it for this application.',
    originSourceNone: 'No gateway address is saved yet.',
    applicationMissing:
      'The gateway address is saved. The application id still has to be set in the server configuration before binding can start.',
    notConfigured:
      'The meeting gateway origin and application are not configured. This app is not connected.',
    contractMissing:
      'The meeting gateway is not configured yet, so login and query stay disabled. Missing: {{names}}',
    identityUnavailable:
      'The first gateway access token comes from account-login and token exchange in the published gateway client. This app does not collect a gateway password or a pasted token, so live OAuth start stays blocked until that contract is confirmed.',
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
    mappedAs: 'OA employee {{employeeNo}}',
    oaUnauthorized: 'OA authorization not granted',
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
    peopleSearchMode: 'People search mode',
    peopleSearchByName: 'Name',
    peopleSearchByEmployeeNo: 'Employee no.',
    peopleFind: 'Find',
    peopleNameMissing: 'Name not provided',
    peopleNamePending: 'Name not loaded yet',
    peopleEmployeeNoNeed: 'Enter the full employee number, then find',
    peopleEmployeeNoEmpty: 'No person found for this employee number',
    peopleEmployeeNoAmbiguous:
      'This employee number could not be uniquely confirmed. Check and try again.',
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
    liveVerified: 'Live OA verified: {{value}}',
    liveVerifiedYes: 'yes',
    liveVerifiedNo: 'no',
    liveSessionRequired:
      'OA OAuth token verification for this Meeting username failed. Formal sync stays blocked until verification succeeds.',
    liveVerifyReason: 'Reason: {{reason}}',
    liveVerifyReasons: {
      cookie_missing:
        'No OA session cookie reached Meeting (legacy SSO path; not used for workspace verify).',
      cookie_ambiguous:
        'Multiple OA cookie values were sent (legacy SSO path; not used for workspace verify).',
      rejected:
        'OA rejected the OAuth token request (check client id/secret or employee_no).',
      unavailable:
        'Meeting could not reach the OA OAuth URL (network, timeout, or OA down).',
      contract_error:
        'OA OAuth response did not match the expected token contract.',
      username_missing:
        'This Meeting account has no username; set username to the full OA employee number.',
      username_mismatch:
        'OA employee number from the token response does not match this Meeting username.',
      oauth_not_configured:
        'OA OAuth URL, client id and secret are not configured (MEETING_OA_OAUTH_URL / MEETING_OA_CLIENT_*).',
      sso_disabled: 'OA SSO validate is disabled or not configured.',
      verified: 'Verified.',
    },
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
    tasksShow: 'Show tasks',
    tasksHide: 'Hide tasks',
    tasksCount: 'Task assignment ({{count}})',
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
    integrationsTitle: 'Meeting OA',
    integrationsDescription:
      'Seal OA credentials with native secrets. Root is never a default employee. Secrets are never echoed.',
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
      summary: 'Meeting minutes',
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
      tasks: 'Task assignment',
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
  meetingOaSso: {
    providerLabel: 'OA',
    signingIn: 'Signing in with OA…',
    openOaLogin: 'Open the OA login page',
    errors: {
      OA_SESSION_REQUIRED:
        'Sign in to OA in this browser first, or use your username and password.',
      OA_SESSION_INVALID:
        'Your OA login has expired. Sign in to OA again, then retry.',
      INVALID_SSO_REQUEST: 'The OA sign-in request was invalid. Try again.',
      MEETING_ACCOUNT_UNAVAILABLE:
        'This OA account cannot sign in to Meeting. Contact an administrator.',
      SESSION_CONFLICT:
        'Sign out of the current Meeting account before using OA login.',
      OA_CONTRACT_ERROR:
        'OA returned an unexpected validate response. Sign in at the same OA host configured for Meeting (intranet :2166), then retry; or use username and password.',
      OA_VALIDATION_UNAVAILABLE:
        'Meeting reached OA but validation failed (often HTTP 500). Use the same OA login host as MEETING_OA_SSO_VALIDATE_URL, refresh OA login, then retry; or use username and password.',
      OA_SSO_NOT_ENABLED: 'OA single sign-on is not enabled.',
      MEETING_SESSION_FAILED:
        'Meeting sign-in could not be completed. Try again or use a password.',
      OA_SSO_RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
      unknown: 'OA sign-in failed. Try again or use a password.',
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
