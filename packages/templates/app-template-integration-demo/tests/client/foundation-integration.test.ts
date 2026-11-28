import { PLUGINS_ACCESS } from '@nocobase/app-plugin-foundation/client';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import shell from '../../client/pages/settings/shell-routes.js';
import cliPlugins from '../../cli/plugins.js';
import foundation from '@nocobase/app-plugin-foundation/client/routes';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';

const app = '@nocobase/app-template-integration-demo';

function flatten(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

function foundationRoutes(): readonly AppClientRegisteredRoute[] {
  return resolveAppClientContributions([
    { packageName: app, source: 'application', routes: [shell] },
    {
      packageName: '@nocobase/app-plugin-foundation',
      source: 'plugin',
      routes: foundation,
    },
  ]).routes;
}

describe('plugins page integration', () => {
  it('lists Plugins in System settings behind «Plugins · View»', () => {
    const plugins = flatten(foundationRoutes()).find(
      (route) => route.name === 'plugins',
    );
    expect(plugins).toMatchObject({
      name: 'plugins',
      path: '/settings/plugins',
      id: '@nocobase/app-plugin-foundation:plugins',
      auth: 'required',
      authz: PLUGINS_ACCESS,
    });
    expect(plugins?.navigation?.description).toBe('nav.pluginsDescription');
  });

  it('sends the earlier Foundation and capability guide addresses to the plugins page', () => {
    const paths = flatten(foundationRoutes())
      .filter(
        (route) =>
          route.packageName === '@nocobase/app-plugin-foundation' &&
          route.name !== 'plugins',
      )
      .map((route) => [route.path, route.navigation]);
    expect(paths).toEqual([
      ['/settings/foundation', undefined],
      ['/settings/capabilities', undefined],
      ['/settings/capabilities/:entryId', undefined],
    ]);
  });

  it('adds no build step: the plugin contributes no commands', () => {
    expect(
      cliPlugins.plugins.map((plugin) => plugin.packageName),
    ).not.toContain('@nocobase/app-plugin-foundation');
  });
});
