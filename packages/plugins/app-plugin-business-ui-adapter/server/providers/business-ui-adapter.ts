import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { casdoorIdentityAdminToken } from '@nocobase/app-plugin-casdoor-identity/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createNativeBusinessAccessChecker,
  denyWithoutPermissionRef,
} from '../business-access.js';
import type { BusinessUiAdapterConfig } from '../config.js';
import { createProtocolServices } from '../services/protocol.js';
import { businessUiAdapterServiceToken } from '../tokens.js';

/**
 * Registers protocol services and periodically reconciles UNKNOWN operations
 * that already have a receipt in the database.
 */
export class BusinessUiAdapterProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-business-ui-adapter';
  private timer: ReturnType<typeof setInterval> | undefined;

  private config(): BusinessUiAdapterConfig {
    return (
      this.app.config.get<BusinessUiAdapterConfig>('businessUiAdapter') ?? {}
    );
  }

  public override register(): void {
    this.app.container.singleton(businessUiAdapterServiceToken, (resolver) =>
      createProtocolServices({
        database: () => resolver.resolve(databaseManagerToken),
        auth: () => resolver.resolve(authenticationToken),
        config: () => this.config(),
        secrets: () =>
          this.app.container.has(secretsServiceToken)
            ? resolver.resolve(secretsServiceToken)
            : undefined,
        authorizeBusiness: this.app.container.has(authorizationToken)
          ? createNativeBusinessAccessChecker(
              resolver.resolve(authorizationToken),
            )
          : denyWithoutPermissionRef,
        assertIdentityFresh: this.app.container.has(casdoorIdentityAdminToken)
          ? (userId) =>
              resolver
                .resolve(casdoorIdentityAdminToken)
                .provisioning.assertDirectorySnapshotFresh(userId)
          : undefined,
      }),
    );
  }

  public override async boot(): Promise<void> {
    if (
      !this.app.container.has(businessUiAdapterServiceToken) ||
      !this.app.container.has(databaseManagerToken)
    ) {
      return;
    }
    this.timer = setInterval(() => {
      void this.app.container
        .resolve(businessUiAdapterServiceToken)
        .reconcileUnknownOperations()
        .catch(() => undefined);
    }, 60_000);
    this.timer.unref?.();
  }

  public override async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
