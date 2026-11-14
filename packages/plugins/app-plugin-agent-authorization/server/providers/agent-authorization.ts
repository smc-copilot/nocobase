import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AgentAuthorizationConfig } from '../config.js';
import { createAgentCredentialResolver } from '../credential-resolver.js';
import { createAgentAuthorizationServices } from '../services/index.js';
import { agentAuthorizationServiceToken } from '../tokens.js';

export class AgentAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-agent-authorization';
  private readonly releases: (() => void)[] = [];

  private config(): AgentAuthorizationConfig {
    return (
      this.app.config.get<AgentAuthorizationConfig>('agentAuthorization') ?? {}
    );
  }

  public override register(): void {
    this.app.container.singleton(agentAuthorizationServiceToken, (resolver) =>
      createAgentAuthorizationServices({
        database: () => resolver.resolve(databaseManagerToken),
        config: () => this.config(),
        defaultAudience: () => this.config().audience ?? 'http://localhost',
      }),
    );
  }

  public override async boot(): Promise<void> {
    const { container } = this.app;
    if (
      !container.has(authenticationToken) ||
      !container.has(agentAuthorizationServiceToken)
    ) {
      return;
    }
    const auth = container.resolve(authenticationToken);
    this.releases.push(
      auth.addCredentialResolver(
        createAgentCredentialResolver({
          services: () => container.resolve(agentAuthorizationServiceToken),
        }),
      ),
    );
    if (container.has(userAdministrationServiceToken)) {
      const users = container.resolve(userAdministrationServiceToken);
      this.releases.push(
        users.addOnUserDisabled(async (userId) => {
          await container
            .resolve(agentAuthorizationServiceToken)
            .lifecycle.revokeUser(userId);
        }),
      );
    }
  }

  public override shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
    return Promise.resolve();
  }
}
