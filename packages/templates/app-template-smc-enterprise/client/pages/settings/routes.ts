import { Fingerprint } from 'lucide-react';
import {
  defineSystemSettingsRoutes,
  SYSTEM_SETTINGS_CATEGORIES,
} from '@nocobase/app-client/plugins';

/**
 * Casdoor external identity bindings, in Accounts and permissions.
 * Users and Roles stay registered by their plugins.
 */
export default defineSystemSettingsRoutes([
  {
    parent: SYSTEM_SETTINGS_CATEGORIES.account,
    name: 'settingsIdentityBindings',
    path: '/identity-bindings',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'casdoorIdentity.externalIdentities' },
      action: 'read',
    },
    navigation: {
      title: 'identity.bindings',
      description: 'identity.bindingsDescription',
      icon: Fingerprint,
    },
    breadcrumb: { title: 'identity.bindings' },
    componentLoader: () => import('./identity-bindings.js'),
  },
]);
