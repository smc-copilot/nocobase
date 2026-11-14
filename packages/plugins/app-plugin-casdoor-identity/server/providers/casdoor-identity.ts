import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { setCasdoorBrowserOAuthRuntime } from '../browser-oauth.js';
import type { CasdoorIdentityConfig } from '../config.js';
import { createCasdoorCredentialResolver } from '../credential-resolver.js';
import {
  createCasdoorDirectory,
  type IdentityDirectory,
} from '../directory.js';
import type { IdentityRuntime } from '../identity/model.js';
import {
  createIdentityServices,
  type IdentityServices,
} from '../identity/services.js';
import { registerIdentitySyncSchedule } from '../scheduling.js';
import { DefaultCasdoorIdentityService } from '../services/casdoor-identity.js';
import {
  casdoorIdentityAdminToken,
  casdoorIdentityServiceToken,
  identityDirectoryToken,
} from '../tokens.js';

/**
 * Registers the identity services and, at boot, teaches Authentication to resolve Casdoor JWTs
 * into scoped issued credentials for bound local users, with first-login provisioning, Permission
 * Set mapping and periodic directory sync.
 */
export class CasdoorIdentityProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-casdoor-identity';
  private readonly releases: (() => void)[] = [];
  private booted = false;
  private directory: IdentityDirectory | undefined;
  private fallbackTimer: ReturnType<typeof setInterval> | undefined;

  private config(): CasdoorIdentityConfig {
    return this.app.config.get<CasdoorIdentityConfig>('casdoorIdentity') ?? {};
  }

  public override register(): void {
    const { container } = this.app;
    container.singleton(
      casdoorIdentityServiceToken,
      (resolver) =>
        new DefaultCasdoorIdentityService(() =>
          resolver.resolve(databaseManagerToken).connection(),
        ),
    );
    container.singleton(
      casdoorIdentityAdminToken,
      (resolver): IdentityServices => {
        const runtime: IdentityRuntime = {
          database: () => resolver.resolve(databaseManagerToken),
          auth: () => resolver.resolve(authenticationToken),
          users: () => resolver.resolve(userAdministrationServiceToken),
          permissionSets: () =>
            container.has(authorizationToken)
              ? resolver.resolve(authorizationToken).permissionSets
              : undefined,
          config: () => this.config(),
        };
        return createIdentityServices(runtime, () => this.resolveDirectory());
      },
    );
  }

  /** An application-registered directory wins; otherwise Casdoor's, from `casdoorIdentity.directory`. */
  private resolveDirectory(): IdentityDirectory | undefined {
    const { container } = this.app;
    if (container.has(identityDirectoryToken)) {
      return container.resolve(identityDirectoryToken);
    }
    const config = this.config().directory;
    if (!config) return undefined;
    this.directory ??= createCasdoorDirectory(config);
    return this.directory;
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
    // Admission stays on each route's `describeRoute().security` + `required({ scopedKeys: true })`.
    // Do not call `addCredentialRoutePolicy(() => true)` — that would admit Casdoor credentials on
    // every host route that only expected sessions or API keys.
    this.releases.push(
      auth.addCredentialResolver(
        createCasdoorCredentialResolver({
          connection: () =>
            container.resolve(databaseManagerToken).connection(),
          config: () => this.config(),
          identity: () =>
            container.resolve(casdoorIdentityAdminToken).provisioning,
        }),
      ),
    );
    // NEXT-02: wire browser genericOAuth getUserInfo → provisioning before session.
    const issuer = this.config().issuer;
    if (issuer && container.has(casdoorIdentityAdminToken)) {
      setCasdoorBrowserOAuthRuntime({
        auth,
        provisioning: container.resolve(casdoorIdentityAdminToken).provisioning,
        issuer,
      });
      this.releases.push(() => setCasdoorBrowserOAuthRuntime(undefined));
    }
    this.registerPeriodicSync();
  }

  /**
   * Periodic reconciliation goes through the Scheduler plugin so it shows up beside every other
   * job. Without it, an optional in-process timer (`sync.fallbackIntervalSeconds`) keeps the
   * sync running.
   *
   * TODO: drop the timer fallback once every supported application registers the Scheduler plugin.
   */
  private registerPeriodicSync(): void {
    const { container } = this.app;
    const sync = container.resolve(casdoorIdentityAdminToken).sync;
    const syncConfig = this.config().sync;
    if (syncConfig?.enabled === false) return;
    // Without a directory there is nothing to reconcile against, unless sync is forced on.
    if (!this.resolveDirectory() && syncConfig?.enabled !== true) return;
    if (container.has(schedulerServiceToken)) {
      registerIdentitySyncSchedule(
        container.resolve(schedulerServiceToken),
        sync,
        syncConfig,
      );
      sync.schedulerMode = 'scheduler';
      return;
    }
    if (syncConfig?.fallbackIntervalSeconds) sync.schedulerMode = 'timer';
  }

  public override start(): Promise<void> {
    const { container } = this.app;
    const sync = container.has(casdoorIdentityAdminToken)
      ? container.resolve(casdoorIdentityAdminToken).sync
      : undefined;
    const seconds = this.config().sync?.fallbackIntervalSeconds;
    if (sync?.schedulerMode === 'timer' && seconds && !this.fallbackTimer) {
      this.fallbackTimer = setInterval(() => {
        void sync.run({ trigger: 'scheduled' }).catch((error: unknown) => {
          console.error('Identity sync (fallback timer) failed', error);
        });
      }, seconds * 1000);
      this.fallbackTimer.unref?.();
    }
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = undefined;
    for (const release of this.releases.splice(0)) release();
    this.booted = false;
    return Promise.resolve();
  }
}
