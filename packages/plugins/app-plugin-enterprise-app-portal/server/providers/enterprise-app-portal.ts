import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { EnterpriseAppPortalConfig } from '../config.js';
import {
  mergeAppEnvWithProcess,
  readAppEnvFiles,
} from '../services/app-env-files.js';
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
    // Octop/Casdoor secret env names are resolved at request time from this map.
    // Standalone loads `.env` into the app scope only — not into `process.env` —
    // so credential lookups must include the application dotenv files.
    const fileEnv = readAppEnvFiles([
      this.app.paths.deploymentRootDir,
      this.app.paths.rootDir,
    ]);
    const env = mergeAppEnvWithProcess(fileEnv);
    container.singleton(enterprisePortalServiceToken, (resolver) =>
      createEnterprisePortalServices(
        () => resolver.resolve(databaseManagerToken),
        () => this.config(),
        { env },
      ),
    );
  }
}
