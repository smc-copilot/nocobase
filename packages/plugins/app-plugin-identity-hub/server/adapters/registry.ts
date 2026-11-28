import { hubError } from '../errors.js';
import type { ProviderType } from '../model.js';
import type { ProviderRegistry } from '../services/providers.js';
import { CasdoorAdapter } from './casdoor.js';
import { LdapAdapter } from './ldap.js';
import { ManualAdapter } from './manual.js';
import { OaLtpaAdapter } from './oa-ltpa.js';
import { OAuth2Adapter } from './oauth2.js';
import { OidcAdapter } from './oidc.js';
import type {
  AdapterDependencies,
  IdentityProviderAdapter,
  ProviderBinding,
} from './types.js';

export type AdapterFactory = (
  provider: ProviderBinding,
  deps: AdapterDependencies,
) => IdentityProviderAdapter;

const defaultFactories: Readonly<Record<ProviderType, AdapterFactory>> = {
  manual: (provider, deps) => new ManualAdapter(provider, deps),
  ldap: (provider, deps) => new LdapAdapter(provider, deps),
  oidc: (provider, deps) => new OidcAdapter(provider, deps),
  oauth2: (provider, deps) => new OAuth2Adapter(provider, deps),
  casdoor: (provider, deps) => new CasdoorAdapter(provider, deps),
  'oa-ltpa': (provider, deps) => new OaLtpaAdapter(provider, deps),
};

/**
 * Maps a provider type to an adapter factory and builds one from a stored provider row.
 * Network clients arrive through `deps` so tests never open a socket.
 */
export class AdapterRegistry {
  private readonly factories = new Map<string, AdapterFactory>();

  public constructor(
    private readonly providers: ProviderRegistry,
    private readonly deps: AdapterDependencies = {},
  ) {
    for (const [type, factory] of Object.entries(defaultFactories)) {
      this.factories.set(type, factory);
    }
  }

  public register(type: string, factory: AdapterFactory): void {
    this.factories.set(type, factory);
  }

  public unregister(type: string): void {
    this.factories.delete(type);
  }

  public async resolve(providerId: string): Promise<IdentityProviderAdapter> {
    const provider = await this.providers.get(providerId);
    if (!provider.enabled) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_PROVIDER_DISABLED',
        'A disabled provider cannot be used.',
      );
    }
    const factory = this.factories.get(provider.providerType);
    if (!factory) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_ADAPTER_NOT_REGISTERED',
        `No adapter is registered for provider type ${provider.providerType}.`,
      );
    }
    return factory(provider, this.deps);
  }
}
