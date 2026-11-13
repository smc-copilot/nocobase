import { describe, expect, it } from 'vitest';

import routes from '../../server/routes/index.js';

describe('@nocobase/app-plugin-casdoor-identity', () => {
  it('registers the casdoorIdentity API contribution', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      scope: 'api',
    });
  });
});
