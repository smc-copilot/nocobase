import { describe, expect, it } from 'vitest';

import routes from '../../server/routes/index.js';

describe('@nocobase/app-plugin-business-ui-adapter routes', () => {
  it('contributes api and protocol route loaders', () => {
    expect(routes).toHaveLength(2);
    for (const contribution of routes) {
      expect(contribution).toEqual(
        expect.objectContaining({
          scope: expect.stringMatching(/api|root/),
          createRouter: expect.any(Function),
        }),
      );
    }
  });
});
