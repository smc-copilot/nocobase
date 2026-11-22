import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ...fileUi,
  navigation: {
    ...systemEnUS.navigation,
    home: 'Employee portal',
  },
  portal: {
    title: 'Employee application portal',
    description:
      'Open the applications Casdoor has authorized for this account.',
    isolationTitle: 'Local isolation test — not a live Casdoor integration',
    isolationBody:
      'Authorized cards below come from contractFixture grants and sample catalog rows. Tokens and secrets are not shown.',
    authorized: 'Authorized applications',
    authorizedHint:
      'Launch re-checks Casdoor access, enabled state and health.',
    autoLaunchDisabled: 'No auto-open',
    autoLaunchIfSingle: 'Open if only one app',
    autoLaunchDefault: 'Open default app',
    empty: 'No authorized applications for this account.',
    open: 'Open',
    setDefault: 'Set as default',
    defaultApp: 'Default',
    launchOpened: 'Opened {{name}}',
    launchFailed: 'Unable to launch this application.',
    prefsSaved: 'Launch preference saved',
    defaultSaved: 'Default application saved',
    prefsFailed: 'Unable to save preferences.',
    userConfigHint:
      'Local user accounts and permissions are under System settings.',
    userConfigLink: 'User management',
    catalogAuthorityTitle: 'Casdoor applications are authoritative',
    catalogAuthorityBody:
      'This page maintains portal launch URLs and enablement. Authorization still lives in Casdoor permissions.',
    catalogNeedUrl: 'Enter a valid http(s) launch URL before saving.',
    catalogImported: 'Application imported into the portal catalog',
    catalogSaved: 'Catalog application saved',
    catalogFailed: 'Unable to save the catalog application.',
    refreshFromCasdoor: 'Refresh from Casdoor',
    casdoorAppKey: 'Casdoor app',
    notInPortal: 'Not in portal',
    imported: 'Imported',
    importToPortal: 'Import',
    removeFromPortal: 'Disable in portal',
    enableInPortal: 'Enable in portal',
    configure: 'Configure',
    configureDrawerTitle: 'Application configuration',
    agentGrantsOnlyOctop:
      'Management API settings and connection tests apply to Octop applications only.',
    sortOrder: 'Sort',
    appCode: 'App code',
    appName: 'Name',
    appType: 'Type',
    baseUrl: 'Base URL',
    bindingIsolation:
      'Preview and commit bind Casdoor issuer+sub to local username via employeeNo. E-mail never auto-merges.',
    bindingCommitted: 'Bindings committed',
    bindingFailed: 'Unable to preview or commit bindings.',
    bindingPreview: 'Preview / commit JSON',
    preview: 'Preview',
    commit: 'Commit',
    issuer: 'Issuer',
    subject: 'Subject',
    localUserId: 'Local user',
    noBindings: 'No issuer+sub bindings yet.',
    auditTitle: 'Portal access audit',
    auditHint:
      'Audit rows store action, result and reason only. Secrets and tokens are never stored.',
    when: 'When',
    actor: 'Actor',
    action: 'Action',
    result: 'Result',
    reason: 'Reason',
    noAudit: 'No audit events yet.',
    connectionHintTitle: 'Server-side Casdoor credentials',
    connectionHintBody:
      'Endpoint, organization and client credentials come from server env or config. This page never shows secrets.',
    connectionErrorTitle: 'Casdoor management unavailable',
    connectionEnvHint:
      'Check CASDOOR_ENDPOINT, CASDOOR_ORGANIZATION, CASDOOR_CLIENT_ID and CASDOOR_CLIENT_SECRET on the server.',
    connectionOk: 'Casdoor connection succeeded',
    connectionFailed: 'Unable to reach Casdoor management.',
    testConnection: 'Test connection',
    readUsers: 'Sample users',
    readApplications: 'Sample applications',
    usersLoaded: 'Sample users loaded',
    usersFailed: 'Unable to list Casdoor users.',
    appsLoaded: 'Sample applications loaded',
    appsFailed: 'Unable to list Casdoor applications.',
    organization: 'Organization',
    authMode: 'Auth mode',
    applicationOwner: 'Application owner',
    permissionOwner: 'Permission owner',
    sampleUsers: 'Sample users',
    sampleApplications: 'Sample applications',
    userName: 'Username',
    displayName: 'Display name',
    department: 'Department',
    casdoorUsers: 'Casdoor users',
    userSearch: 'Search username or employee number',
    search: 'Search',
    pageOf: 'Page {{page}} / {{total}}',
    groupTree: 'Organization groups',
    refreshGroups: 'Refresh',
    noGroups: 'No Casdoor groups returned.',
    groupsFailed: 'Unable to list Casdoor groups.',
    selectGroup: 'Select a group',
    selectGroupHint: 'Choose a group in the tree to list its members.',
    memberCount: '{{count}} members',
    selectedCount: '{{count}} selected',
    includeSubDepartments: 'Include sub-departments',
    onlyUnauthorized: 'Only users without authorized apps',
    selectAllOnPage: 'Select all on this page',
    selectAllVisible: 'Select all filtered users',
    displayNameSearch: 'Filter by display name',
    authorizedApps: 'Authorized apps',
    selectUserFromGroup:
      'Select one or more employees in the middle list to edit application grants.',
    grantsHintTitle: 'Direct vs inherited grants',
    grantsHintBody:
      'Pick a group, then select employees. Saving writes the checked apps as each selected user’s direct portal grants.',
    grantsFor: 'Grants for {{name}}',
    grantsBatchFor: 'Batch grants ({{count}} users)',
    grantsBatchHint:
      'Checked apps become the direct grant set for every selected user. Unchecked apps are removed from their direct grants.',
    grantsBatchSaved: 'Saved grants for {{count}} users',
    selectUser: 'Select a user',
    selectUserHint:
      'Choose a Casdoor user on the left to edit application grants.',
    grantsReadOnly:
      'You can view grants but need configure permission to save.',
    grantsSaved: 'Application grants saved',
    grantsFailed: 'Unable to load or save application grants.',
    grantsStaleTitle: 'Stale Casdoor application names',
    grantsStaleHint:
      'Direct grants still include applications Casdoor no longer has: {{names}}. Saving will revoke those grants; check the new application name instead (for example octop-uat after a rename).',
    grantDirect: 'Direct grant',
    grantInherited: 'Inherited (cannot revoke here)',
  },
  settings: {
    ...systemEnUS.settings,
    portalAgentGrants: 'Agent grants',
    portalAgentGrantsDescription:
      'Create an Octop directory user and an optional published expert for one authorized employee. Tokens stay on the server.',
    portalAgentGrantsApplications: 'Octop applications',
    portalAgentGrantsEmployees: 'Authorized employees',
    portalAgentGrantsTemplates: 'Published templates',
    portalAgentGrantsEmptyApplications:
      'No Octop application has Agent Grants enabled.',
    portalAgentGrantsSelectApplication: 'Select an Octop application.',
    portalAgentGrantsSelectEmployee: 'Select one employee.',
    portalAgentGrantsSelectTemplate: 'Select one published template.',
    portalAgentGrantsSearchTemplates: 'Search templates',
    portalAgentGrantsNoTemplates: 'This instance has no published templates.',
    portalAgentGrantsAccountExists:
      'This employee already has an account on this Octop instance. This action will not create a user.',
    portalAgentGrantsAccountMissing: 'No Octop account on this instance.',
    portalAgentGrantsAccountDisabled:
      'The Octop account exists and is disabled. Agent Grants will not create a replacement.',
    portalAgentGrantsOctopUserId: 'Octop user ID',
    portalAgentGrantsInstalledExperts: 'Installed experts',
    portalAgentGrantsNoExperts: 'No installed experts.',
    portalAgentGrantsAgentId: 'Agent ID',
    portalAgentGrantsPublishedExpertId: 'Published template ID',
    portalAgentGrantsExpertState: 'State',
    portalAgentGrantsBootstrapPending: 'Expert initialization in progress',
    portalAgentGrantsCreate: 'Create expert',
    portalAgentGrantsCreateTitle: 'Create Octop user',
    portalAgentGrantsUsername: 'Username',
    portalAgentGrantsDisplayName: 'Display name',
    portalAgentGrantsEmail: 'Email',
    portalAgentGrantsDirectoryLocked: 'Directory account',
    portalAgentGrantsDirectoryNote:
      'Directory login stays on. This version does not create a local Octop password.',
    portalAgentGrantsRole: 'Role',
    portalAgentGrantsPermissions: 'Permissions',
    portalAgentGrantsMaxAgents: 'Max agents',
    portalAgentGrantsTokenQuota: 'Token quota',
    portalAgentGrantsWorkspaceRoot: 'Workspace root',
    portalAgentGrantsBackendTypes: 'Allowed backend types',
    portalAgentGrantsCreateDefaultExpert: 'Create default expert',
    portalAgentGrantsBoundTemplate: 'Bound published template',
    portalAgentGrantsNoBoundTemplate:
      'Select a published template before creating a default expert.',
    portalAgentGrantsLdapRequired:
      'Octop LDAP is not ready. Directory accounts cannot be created until it is configured.',
    portalAgentGrantsNullableHint: 'Leave blank for null. Blank is not zero.',
    portalAgentGrantsSubmit: 'Create user',
    portalAgentGrantsUserCreated: 'User created',
    portalAgentGrantsCompleted: 'Completed',
    portalAgentGrantsBootstrapFailed: 'Expert initialization failed',
    portalAgentGrantsOutcomeUnknown: 'Outcome unknown',
    portalAgentGrantsOutcomeUnknownHint:
      'The create request did not return a confirmed result. Reconcile reads Octop and does not send another create.',
    portalAgentGrantsReconcile: 'Reconcile',
    portalAgentGrantsRefreshStatus: 'Refresh status',
    portalAgentGrantsGrantDirect: 'Direct',
    portalAgentGrantsGrantInherited: 'Inherited',
    portalAgentGrantsForbidden: 'Forbidden',
    portalAgentGrantsTemplateId: 'Template ID',
    portalAgentGrantsPublisher: 'Publisher',
    portalAgentGrantsUpdatedAt: 'Updated',
    portalAgentGrantsFailed: 'Unable to load or create the Agent Grant.',
    portalAgentGrantsReadOnly:
      'You can view Agent Grants but need configure permission to create a user.',
    portalAgentGrantsEnabled: 'Enable Agent Grants',
    portalAgentGrantsApiBaseUrl: 'Management API base URL',
    portalAgentGrantsApiAuthMode: 'Management API auth',
    portalAgentGrantsBearerEnv: 'Bearer token env',
    portalAgentGrantsPasswordLoginEnv: 'Password login env',
    portalAgentGrantsApiTokenEnv: 'Token env name',
    portalAgentGrantsApiUsernameEnv: 'Username env name',
    portalAgentGrantsApiPasswordEnv: 'Password env name',
    portalAgentGrantsEnvNameHint:
      'Enter server environment variable names only (for example OCTOP_API_TOKEN_99170). This page never shows or stores token or password values. Use the API origin without a trailing /api.',
    portalAgentGrantsConfigSaved: 'Agent Grants connection saved',
    portalAgentGrantsConfigFailed:
      'Unable to save the Agent Grants connection.',
    portalAgentGrantsNeedApiUrl:
      'Enter an http(s) management API origin before enabling Agent Grants (for example https://ai.superic.com:8091, without /api).',
    portalAgentGrantsNeedEnvName:
      'Enter a valid environment variable name (letters, digits, underscore). Do not paste a token or password into this form; put the real value in the application .env.',
    portalAgentGrantsSaveBeforeTest:
      'Enable Agent Grants and save successfully before testing the connection.',
    portalAgentGrantsTestConnection: 'Test management connection',
    portalAgentGrantsConnectionOk: 'Octop management connection succeeded',
    portalAgentGrantsConnectionFailed:
      'Unable to reach the Octop management API.',
    portalAgentGrantsOptionsFailed:
      'Unable to load roles or permissions. Creating is blocked.',
    portalAgentGrantsLookupFailed:
      'Unable to read the Octop account. Creating is blocked.',
    portalAgentGrantsNoAdminRole: 'Administrator roles are not available here.',
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
