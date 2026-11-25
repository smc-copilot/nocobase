import { describe, expect, it } from 'vitest';

import { dockerSandboxBackend } from '../../server/services/octop-docker-backend.js';

describe('docker sandbox backend', () => {
  it('selects the named sandbox resource', () => {
    expect(dockerSandboxBackend()).toEqual({
      type: 'named',
      name: 'sandbox',
    });
  });
});
