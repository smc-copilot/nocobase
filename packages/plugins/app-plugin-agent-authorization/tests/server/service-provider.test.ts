import { describe, expect, it } from 'vitest';

import providers from '../../server/providers/index.js';

describe('agent authorization providers', () => {
  it('registers the service and authorization providers', () => {
    expect(providers.length).toBe(2);
  });
});
