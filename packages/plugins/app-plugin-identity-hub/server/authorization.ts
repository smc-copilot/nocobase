import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export const IDENTITY_HUB_SECTION = 'identity-hub';

export const SETTINGS_PERSONS = 'identityHub.persons';
export const SETTINGS_PROVIDERS = 'identityHub.providers';
export const SETTINGS_IDENTITIES = 'identityHub.identities';
export const SETTINGS_APPS = 'identityHub.apps';
export const SETTINGS_MEMBERSHIPS = 'identityHub.memberships';
export const SETTINGS_AUDIT = 'identityHub.audit';
export const SETTINGS_CONFLICTS = 'identityHub.conflicts';

const read = { name: 'read', title: 'View' } as const;
const manage = { name: 'manage', title: 'Change' } as const;

/**
 * Registers Identity Hub administration as `authz.settings` items. Installing applications
 * own the pages. Every `/api/identityHub` route checks one of these items.
 */
export function registerIdentityHubSettings(authz: AppAuthorization): void {
  authz.ui.sections.add({
    name: IDENTITY_HUB_SECTION,
    title: 'Identity Hub',
    parent: 'administration',
  });
  const items = [
    {
      id: SETTINGS_PERSONS,
      title: 'Identity Hub persons',
      actions: [read, manage],
    },
    {
      id: SETTINGS_PROVIDERS,
      title: 'Identity Hub providers',
      actions: [read, manage],
    },
    {
      id: SETTINGS_IDENTITIES,
      title: 'Identity Hub linked identities',
      actions: [read, manage],
    },
    {
      id: SETTINGS_APPS,
      title: 'Identity Hub applications',
      actions: [read, manage],
    },
    {
      id: SETTINGS_MEMBERSHIPS,
      title: 'Identity Hub memberships',
      actions: [read, manage],
    },
    {
      id: SETTINGS_AUDIT,
      title: 'Identity Hub audit',
      actions: [read],
    },
    {
      id: SETTINGS_CONFLICTS,
      title: 'Identity Hub conflicts',
      actions: [read, manage],
    },
  ] as const;
  for (const item of items) {
    authz.settings.add({ ...item, actions: [...item.actions] });
    authz.ui.place(
      { type: 'settings', id: item.id },
      { section: IDENTITY_HUB_SECTION },
    );
  }
}

export class IdentityHubAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-identity-hub/authorization';

  public override boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(authorizationToken)) {
      registerIdentityHubSettings(container.resolve(authorizationToken));
    }
    return Promise.resolve();
  }
}
