import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  PORTAL_SETTINGS_SECTION,
  SETTINGS_AUDIT,
  SETTINGS_CASDOOR,
  SETTINGS_CATALOG,
} from './config.js';

export function registerPortalSettings(authz: AppAuthorization): void {
  authz.ui.sections.add({
    name: PORTAL_SETTINGS_SECTION,
    title: 'Enterprise app portal',
    parent: 'administration',
  });
  const items = [
    {
      id: SETTINGS_CATALOG,
      title: 'Application catalog',
      actions: [
        { name: 'read', title: 'View the application catalog' },
        { name: 'configure', title: 'Create or update catalog entries' },
      ],
    },
    {
      id: SETTINGS_CASDOOR,
      title: 'Casdoor application grants',
      actions: [
        { name: 'read', title: 'View Casdoor users, applications, and grants' },
        {
          name: 'configure',
          title: 'Grant or revoke Casdoor application access',
        },
      ],
    },
    {
      id: SETTINGS_AUDIT,
      title: 'Portal access audit',
      actions: [{ name: 'read', title: 'View portal access audit events' }],
    },
  ] as const;
  for (const item of items) {
    authz.settings.add({ ...item, actions: [...item.actions] });
    authz.ui.place(
      { type: 'settings', id: item.id },
      { section: PORTAL_SETTINGS_SECTION },
    );
  }
}

export class EnterprisePortalAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@superice/app-plugin-enterprise-app-portal/authorization';

  public override boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(authorizationToken)) {
      registerPortalSettings(container.resolve(authorizationToken));
    }
    return Promise.resolve();
  }
}
