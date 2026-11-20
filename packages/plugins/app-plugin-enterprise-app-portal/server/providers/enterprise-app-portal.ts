import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { EnterpriseAppPortalConfig } from '../config.js';
import { createEnterprisePortalServices } from '../services/composition.js';
import { enterprisePortalServiceToken } from '../tokens.js';

export class EnterprisePortalProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@superice/app-plugin-enterprise-app-portal';

  private config(): EnterpriseAppPortalConfig {
    return (
      this.app.config.get<EnterpriseAppPortalConfig>('enterpriseAppPortal') ??
      {}
    );
  }

  public override register(): void {
    const { container } = this.app;
    container.singleton(enterprisePortalServiceToken, (resolver) =>
      createEnterprisePortalServices(
        () => resolver.resolve(databaseManagerToken),
        () => this.config(),
      ),
    );
  }
}
