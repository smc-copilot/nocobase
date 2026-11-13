import { describe, expect, it } from 'vitest';

import { CasdoorIdentityProvider } from '../../server/providers/casdoor-identity.js';
import serviceProviders from '../../server/providers/index.js';
import routes from '../../server/routes/index.js';
import casdoorIdentityPlugin from '../../server/index.js';

describe('@nocobase/app-plugin-casdoor-identity', () => {
  it('declares its server contributions', () => {
    expect(casdoorIdentityPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-casdoor-identity',
      serviceProviders,
      routes,
    });
    expect(serviceProviders).toContain(CasdoorIdentityProvider);
    expect(casdoorIdentityPlugin.database).toEqual({
      migrations: './database/migrations',
    });
  });
});
