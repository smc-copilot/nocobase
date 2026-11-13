import { describe, expect, it } from 'vitest';

import { BusinessUiAdapterProvider } from '../../server/providers/business-ui-adapter.js';
import serviceProviders from '../../server/providers/index.js';
import routes from '../../server/routes/index.js';
import businessUiAdapterPlugin from '../../server/index.js';

describe('@nocobase/app-plugin-business-ui-adapter', () => {
  it('declares its server contributions', () => {
    expect(businessUiAdapterPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-business-ui-adapter',
      serviceProviders,
      routes,
    });
    expect(serviceProviders).toContain(BusinessUiAdapterProvider);
    expect(businessUiAdapterPlugin.database).toEqual({
      migrations: './database/migrations',
    });
  });
});
