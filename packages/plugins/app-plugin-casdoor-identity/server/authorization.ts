import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  SETTINGS_MAPPING,
  SETTINGS_SUBJECT_BINDINGS,
  SETTINGS_SYNC,
} from './config.js';

/** The permission workspace subsection (under administration) listing the identity settings. */
export const IDENTITY_SETTINGS_SECTION = 'casdoor-identity';

/**
 * Registers the identity administration surfaces as `authz.settings` items. The pages that render
 * them belong to the installing application; the HTTP API checks these items on every route.
 */
export function registerIdentitySettings(authz: AppAuthorization): void {
  authz.ui.sections.add({
    name: IDENTITY_SETTINGS_SECTION,
    title: 'Identity',
    parent: 'administration',
  });
  const items = [
    {
      id: SETTINGS_SYNC,
      title: 'Identity sync',
      actions: [
        { name: 'read', title: 'View sync status and runs' },
        { name: 'run', title: 'Run or preview a reconciliation' },
      ],
    },
    {
      id: SETTINGS_MAPPING,
      title: 'Identity providers and mapping rules',
      actions: [
        { name: 'read', title: 'View providers and mapping rules' },
        { name: 'configure', title: 'Change providers and mapping rules' },
      ],
    },
    {
      id: SETTINGS_SUBJECT_BINDINGS,
      title: 'Business UI subject bindings',
      actions: [
        { name: 'read', title: 'View subject bindings' },
        { name: 'import', title: 'Preview and commit subject binding imports' },
        {
          name: 'revoke',
          title: 'Revoke or re-enable subject bindings',
        },
      ],
    },
  ] as const;
  for (const item of items) {
    authz.settings.add({ ...item, actions: [...item.actions] });
    authz.ui.place(
      { type: 'settings', id: item.id },
      { section: IDENTITY_SETTINGS_SECTION },
    );
  }
}

export class CasdoorIdentityAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-casdoor-identity/authorization';

  public override boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(authorizationToken)) {
      registerIdentitySettings(container.resolve(authorizationToken));
    }
    return Promise.resolve();
  }
}
