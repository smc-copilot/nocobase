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
      'Open the applications Casdoor has authorized for this account. Isolation fixtures are labeled and are not a live IdP.',
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
    catalogNotAccess:
      'Saving a catalog URL never expands the deployment allowlist and never grants Casdoor access. Isolation fixtures only.',
    catalogSaved: 'Catalog application saved',
    catalogFailed: 'Unable to save the catalog application.',
    catalogCreate: 'Add catalog application',
    appCode: 'App code',
    appName: 'Name',
    appType: 'Type',
    baseUrl: 'Base URL',
    bindingIsolation:
      'Preview and commit bind Casdoor issuer+sub to local username via employeeNo. E-mail never auto-merges. Sample rows are isolation fixtures, not a live IdP.',
    bindingCommitted: 'Bindings committed',
    bindingFailed: 'Unable to preview or commit bindings.',
    bindingPreview: 'Preview / commit JSON',
    preview: 'Preview',
    commit: 'Commit',
    issuer: 'Issuer',
    subject: 'Subject',
    localUserId: 'Local user',
    noBindings: 'No issuer+sub bindings yet.',
    auditHint:
      'Audit rows store action, result and reason only. Isolation fixtures are not live IdP traffic.',
    when: 'When',
    actor: 'Actor',
    action: 'Action',
    result: 'Result',
    reason: 'Reason',
    noAudit: 'No audit events yet.',
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
