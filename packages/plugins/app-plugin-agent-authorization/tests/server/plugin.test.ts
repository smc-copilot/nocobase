import { describe, expect, it } from 'vitest';

import plugin from '../../server/plugin.js';

describe('agent authorization plugin', () => {
  it('declares the package and migrations directory', () => {
    expect(plugin.packageName).toBe('@nocobase/app-plugin-agent-authorization');
    expect(plugin.database?.migrations).toBe('./database/migrations');
  });
});
