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
  agentAuthorization: {
    title: 'Agent authorization',
    description:
      'Register agent clients, review grants, and read the authorization audit.',
    clients: 'Clients',
    clientsDescription:
      'Create clients, rotate secrets, and enable or disable access.',
    grants: 'Grants',
    grantsDescription: 'Active and revoked authorizations.',
    audit: 'Audit',
    auditDescription: 'Client changes and grant revocations.',
    name: 'Name',
    instanceLabel: 'Instance',
    redirectUri: 'Redirect URI',
    scopes: 'Scopes',
    scope: {
      'business-ui:view': 'View business UI',
      'business-ui:edit': 'Edit business UI',
    },
    status: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    actions: 'Actions',
    create: 'Create client',
    rotate: 'Rotate secret',
    enable: 'Enable',
    disable: 'Disable',
    revoke: 'Revoke',
    secretOnce: 'Copy this secret now. It is not shown again.',
    empty: 'Nothing to show.',
    requestFailed: 'The request failed.',
    client: 'Client',
    user: 'User',
    audience: 'Audience',
    expires: 'Expires',
    noExpiry: 'No expiry',
    grant: 'Grant',
    when: 'When',
    action: 'Action',
    decision: 'Decision',
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
