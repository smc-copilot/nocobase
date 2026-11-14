import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import serverPlugins from '../../server/plugins.ts';

describe('SMC Control plugin assembly', () => {
  it('registers Casdoor identity and Releases on the server', () => {
    const names = serverPlugins.plugins.map((plugin) => plugin.packageName);
    expect(names).toContain('@nocobase/app-plugin-casdoor-identity');
    expect(names).toContain('@nocobase/app-plugin-agent-authorization');
    expect(names).toContain('@nocobase/app-plugin-releases');
    expect(names).not.toContain('@nocobase/app-plugin-business-ui-adapter');
  });

  it('declares Casdoor identity as a production dependency', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['@nocobase/app-plugin-casdoor-identity']).toBe(
      'workspace:^',
    );
    expect(
      manifest.dependencies['@nocobase/app-plugin-agent-authorization'],
    ).toBe('workspace:^');
    expect(manifest.dependencies['@nocobase/db-postgres']).toBe('workspace:^');
  });
});
