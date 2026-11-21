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
    importToPortal: 'Import',
    removeFromPortal: 'Disable in portal',
    enableInPortal: 'Enable in portal',
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
    grantDirect: 'Direct grant',
    grantInherited: 'Inherited (cannot revoke here)',
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
