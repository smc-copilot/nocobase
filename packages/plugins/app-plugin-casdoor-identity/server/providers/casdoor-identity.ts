import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import type { CasdoorIdentityConfig } from '../config.js';
import { CASDOOR_ACCESS_TOKEN_SCHEME } from '../config.js';
import { createCasdoorCredentialResolver } from '../credential-resolver.js';
import { DefaultCasdoorIdentityService } from '../services/casdoor-identity.js';
import { casdoorIdentityServiceToken } from '../tokens.js';

/**
 * Registers the identity service and, at boot, teaches Authentication to resolve Casdoor JWTs
 * into scoped issued credentials for bound local users.
 */
export class CasdoorIdentityProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-casdoor-identity';
  private readonly releases: (() => void)[] = [];
  private booted = false;

  public override register(): void {
    const { container } = this.app;
    container.singleton(
      casdoorIdentityServiceToken,
      (resolver) =>
        new DefaultCasdoorIdentityService(() =>
          resolver.resolve(databaseManagerToken).connection(),
        ),
    );
  }

  public override async boot(): Promise<void> {
    const { container } = this.app;
    if (
      this.booted ||
      !container.has(authenticationToken) ||
      !container.has(databaseManagerToken)
    ) {
      return;
    }
    this.booted = true;
    const auth = container.resolve(authenticationToken);
    this.releases.push(
      auth.addCredentialResolver(
        createCasdoorCredentialResolver({
          connection: () =>
            container.resolve(databaseManagerToken).connection(),
          config: () =>
            this.app.config.get<CasdoorIdentityConfig>('casdoorIdentity'),
        }),
      ),
    );
    this.releases.push(
      auth.addCredentialRoutePolicy((_context, credential) =>
        credential.scheme === CASDOOR_ACCESS_TOKEN_SCHEME ? true : undefined,
      ),
    );
  }

  public override shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
    this.booted = false;
    return Promise.resolve();
  }
}
