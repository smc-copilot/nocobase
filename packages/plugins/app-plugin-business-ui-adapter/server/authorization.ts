import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  SETTINGS_AUDIT,
  SETTINGS_CONNECTIONS,
  SETTINGS_FORMS,
} from './config.js';

/** The permission workspace subsection listing Business UI Adapter settings. */
export const BUSINESS_UI_SETTINGS_SECTION = 'business-ui-adapter';

/**
 * Registers adapter administration surfaces as `authz.settings` items.
 * Ordinary authenticated users without these actions cannot configure connections or forms.
 */
export function registerBusinessUiSettings(authz: AppAuthorization): void {
  authz.ui.sections.add({
    name: BUSINESS_UI_SETTINGS_SECTION,
    title: 'Business UI Adapter',
    parent: 'administration',
  });
  const items = [
    {
      id: SETTINGS_CONNECTIONS,
      title: 'Business UI connections',
      actions: [
        { name: 'read', title: 'View connections' },
        { name: 'configure', title: 'Create or update connections' },
        { name: 'rotate', title: 'Rotate connection service secrets' },
      ],
    },
    {
      id: SETTINGS_FORMS,
      title: 'Business UI forms',
      actions: [
        { name: 'read', title: 'View registered forms' },
        { name: 'configure', title: 'Register or update forms' },
      ],
    },
    {
      id: SETTINGS_AUDIT,
      title: 'Business UI audit',
      actions: [{ name: 'read', title: 'View interactions and operations' }],
    },
  ] as const;
  for (const item of items) {
    authz.settings.add({ ...item, actions: [...item.actions] });
    authz.ui.place(
      { type: 'settings', id: item.id },
      { section: BUSINESS_UI_SETTINGS_SECTION },
    );
  }
}

export class BusinessUiAdapterAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-business-ui-adapter/authorization';

  public override boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(authorizationToken)) {
      registerBusinessUiSettings(container.resolve(authorizationToken));
    }
    return Promise.resolve();
  }
}
