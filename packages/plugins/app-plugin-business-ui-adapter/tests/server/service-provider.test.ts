import { describe, expect, it } from 'vitest';

import { BusinessUiAdapterProvider } from '../../server/providers/business-ui-adapter.js';

describe('@nocobase/app-plugin-business-ui-adapter provider', () => {
  it('names the package', () => {
    const provider = new BusinessUiAdapterProvider({
      container: {
        has: () => false,
        resolve: () => undefined,
        singleton: () => undefined,
      },
      config: { get: () => undefined },
    } as never);
    expect(provider.name).toBe('@nocobase/app-plugin-business-ui-adapter');
  });
});
