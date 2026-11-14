import { describe, expect, it } from 'vitest';

import routes from '../../server/routes/index.js';

describe('agent authorization routes', () => {
  it('exports the api route contribution', () => {
    expect(routes.length).toBeGreaterThan(0);
  });
});
