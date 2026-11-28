import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { NoopOutboxPublisher } from '../outbox.js';
import { HubRuntime } from '../runtime.js';
import {
  createIdentityHubServices,
  type IdentityHubServices,
} from '../services/create.js';
import {
  adapterRegistryToken,
  admissionPolicyToken,
  appRegistryServiceToken,
  conflictQueueToken,
  identityAuditLogToken,
  identityLinkServiceToken,
  identitySyncServiceToken,
  membershipServiceToken,
  organizationServiceToken,
  outboxPublisherToken,
  personServiceToken,
  providerRegistryToken,
} from '../tokens.js';

export class IdentityHubProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-identity-hub';

  public override register(): void {
    const { container } = this.app;
    let services: IdentityHubServices | undefined;
    const resolveServices = (): IdentityHubServices => {
      services ??= createIdentityHubServices(
        new HubRuntime(
          container.resolve(databaseManagerToken),
          new NoopOutboxPublisher(),
        ),
      );
      return services;
    };
    container.singleton(personServiceToken, () => resolveServices().persons);
    container.singleton(
      identityLinkServiceToken,
      () => resolveServices().identities,
    );
    container.singleton(
      providerRegistryToken,
      () => resolveServices().providers,
    );
    container.singleton(
      organizationServiceToken,
      () => resolveServices().organizations,
    );
    container.singleton(appRegistryServiceToken, () => resolveServices().apps);
    container.singleton(
      membershipServiceToken,
      () => resolveServices().memberships,
    );
    container.singleton(identityAuditLogToken, () => resolveServices().audit);
    container.singleton(conflictQueueToken, () => resolveServices().conflicts);
    container.singleton(
      admissionPolicyToken,
      () => resolveServices().admission,
    );
    container.singleton(
      outboxPublisherToken,
      () => resolveServices().runtime.outbox,
    );
    container.singleton(adapterRegistryToken, () => resolveServices().adapters);
    container.singleton(identitySyncServiceToken, () => resolveServices().sync);
  }
}
