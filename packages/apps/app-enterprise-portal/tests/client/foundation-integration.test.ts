import { PLUGINS_ACCESS } from '@nocobase/app-plugin-foundation/client';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { describe, expect, it } from 'vitest';

import appRuntime from '../../client/runtime.js';
import cliPlugins from '../../cli/plugins.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
} from '../../client/routing/route-navigation.js';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';

function flatten(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

describe('plugins page integration', () => {
  it('lists Plugins in System settings behind «Plugins · View»', async () => {
    const runtime = await resolveAppRuntime(appRuntime);
    const system = buildSettingsCatalog(runtime.routes, new Set()).find(
      ({ route }) => route.name === 'systemSettings.system',
    );
    const plugins = system?.modules.find(
      ({ route }) => route.name === 'plugins',
    );
    expect(plugins?.target.path).toBe('/settings/plugins');
    expect(plugins?.route).toMatchObject({
      id: '@nocobase/app-plugin-foundation:plugins',
      auth: 'required',
      authz: PLUGINS_ACCESS,
    });
    // A settings page, not a business menu entry.
    expect(
      buildRouteNavigation(runtime.routes, new Set()).some(
        ({ route }) => route.name === 'plugins',
      ),
    ).toBe(false);
  });

  it('keeps Plugins in the System category and out of the business menu', async () => {
    const { routes } = await resolveAppRuntime(appRuntime);
    const owners = buildSettingsCatalog(routes, new Set())
      .filter((category) =>
        category.modules.some(({ route }) => route.name === 'plugins'),
      )
      .map((category) => category.route.name);
    expect(owners).toEqual(['systemSettings.system']);
    const menu = (
      items: ReturnType<typeof buildRouteNavigation>,
    ): readonly string[] =>
      items.flatMap((item) => [item.route.name, ...menu(item.children)]);
    expect(menu(buildRouteNavigation(routes, new Set()))).not.toContain(
      'plugins',
    );
  });

  it('sends the earlier Foundation and capability guide addresses to the plugins page', async () => {
    const runtime = await resolveAppRuntime(appRuntime);
    const paths = flatten(runtime.routes)
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
