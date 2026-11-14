import { agentAuthorizationServiceToken } from '@nocobase/app-plugin-agent-authorization/server/tokens';
import type { AgentAuthorizationServices } from '@nocobase/app-plugin-agent-authorization/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createNativeBusinessAccessChecker,
  denyWithoutPermissionRef,
} from '../business-access.js';
import type { BusinessUiAdapterConfig } from '../config.js';
import { ProtocolError } from '../errors.js';
import {
  grantContextFromCredentialData,
  type GrantContext,
} from '../grants.js';
import { createProtocolServices } from '../services/protocol.js';
import { businessUiAdapterServiceToken } from '../tokens.js';

function toGrantContext(usable: {
  readonly grant: {
    readonly id: string;
    readonly clientId: string;
    readonly localUserId: string;
    readonly audience: string;
    readonly scopes: readonly string[];
    readonly revision: number;
  };
  readonly client: { readonly allowedScopes: readonly string[] };
}): GrantContext {
  return {
    grantId: usable.grant.id,
    clientId: usable.grant.clientId,
    localUserId: usable.grant.localUserId,
    audience: usable.grant.audience,
    scopes: usable.grant.scopes,
    clientScopes: usable.client.allowedScopes,
    revision: usable.grant.revision,
  };
}

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
    this.app.container.singleton(businessUiAdapterServiceToken, (resolver) => {
      const agent = (): AgentAuthorizationServices | undefined =>
        this.app.container.has(agentAuthorizationServiceToken)
          ? resolver.resolve(agentAuthorizationServiceToken)
          : undefined;
      return createProtocolServices({
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
        getAgentCredential: (userId, credentialData) =>
          grantContextFromCredentialData(userId, credentialData),
        requireGrant: async (grantId) => {
          const services = agent();
          if (!services) {
            throw new ProtocolError(
              'GRANT_REQUIRED',
              403,
              'Agent authorization is required',
            );
          }
          try {
            return toGrantContext(await services.grants.requireUsable(grantId));
          } catch (error) {
            if (error instanceof ProtocolError) throw error;
            throw new ProtocolError(
              'GRANT_REQUIRED',
              403,
              'Agent grant is not active',
            );
          }
        },
        audience: () => {
          const configured = this.app.config.get<{ audience?: string }>(
            'agentAuthorization',
          )?.audience;
          const origin = (this.app as { publicOrigin?: string }).publicOrigin;
          return configured || origin || '';
        },
      });
    });
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
