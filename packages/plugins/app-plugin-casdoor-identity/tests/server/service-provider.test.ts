import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { CasdoorIdentityProvider } from '../../server/providers/casdoor-identity.js';
import { DefaultCasdoorIdentityService } from '../../server/services/casdoor-identity.js';
import { casdoorIdentityServiceToken } from '../../server/tokens.js';

describe('@nocobase/app-plugin-casdoor-identity', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          storage: ':memory:',
        },
      },
    });
    container.instance(databaseManagerToken, database);
    const provider = new CasdoorIdentityProvider({
      container,
      config: { get: () => undefined },
    } as unknown as AppPluginApplication);

    expect(provider.name).toBe('@nocobase/app-plugin-casdoor-identity');
    expect(
      container.resolveIfCreated(casdoorIdentityServiceToken),
    ).toBeUndefined();

    provider.register();

    const service = container.resolve(casdoorIdentityServiceToken);
    expect(service).toBeInstanceOf(DefaultCasdoorIdentityService);
    expect(service.getMessage()).toBe('Casdoor identity credential resolver');
    expect(container.resolve(casdoorIdentityServiceToken)).toBe(service);
  });
});
