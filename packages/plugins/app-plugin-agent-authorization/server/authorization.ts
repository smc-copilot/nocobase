import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { SETTINGS_AUDIT, SETTINGS_CLIENTS, SETTINGS_GRANTS } from './config.js';

export const AGENT_AUTHORIZATION_SETTINGS_SECTION = 'agent-authorization';

export function registerAgentAuthorizationSettings(
  authz: AppAuthorization,
): void {
  authz.ui.sections.add({
    name: AGENT_AUTHORIZATION_SETTINGS_SECTION,
    title: 'Agent Authorization',
    parent: 'administration',
  });
  const items = [
    {
      id: SETTINGS_CLIENTS,
      title: 'Agent clients',
      actions: [
        { name: 'read', title: 'View clients' },
        { name: 'configure', title: 'Create or update clients' },
        { name: 'rotate', title: 'Rotate client secrets' },
      ],
    },
    {
      id: SETTINGS_GRANTS,
      title: 'Agent grants',
      actions: [
        { name: 'read', title: 'View grants' },
        { name: 'revoke', title: 'Revoke grants' },
      ],
    },
    {
      id: SETTINGS_AUDIT,
      title: 'Agent authorization audit',
      actions: [{ name: 'read', title: 'View audit events' }],
    },
  ] as const;
  for (const item of items) {
    authz.settings.add({ ...item, actions: [...item.actions] });
    authz.ui.place(
      { type: 'settings', id: item.id },
      { section: AGENT_AUTHORIZATION_SETTINGS_SECTION },
    );
  }
}

export class AgentAuthorizationAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-agent-authorization/authorization';

  public override boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(authorizationToken)) {
      registerAgentAuthorizationSettings(container.resolve(authorizationToken));
    }
    return Promise.resolve();
  }
}
