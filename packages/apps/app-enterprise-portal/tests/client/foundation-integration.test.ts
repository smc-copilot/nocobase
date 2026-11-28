import { PLUGINS_ACCESS } from '@nocobase/app-plugin-foundation/client';
import {
  defineAppRoutes,
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';
import foundation from '@nocobase/app-plugin-foundation/client/routes';
import cliPlugins from '../../cli/plugins.js';
import { createApplicationRoutes } from '../../client/routes.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
  routeKey,
} from '../../client/routing/route-navigation.js';

const app = '@superice/app-enterprise-portal';

function resolve(...extra: ReturnType<typeof defineAppRoutes>[]) {
  return resolveAppClientContributions([
    {
      packageName: app,
      source: 'application',
      routes: [...createApplicationRoutes(), ...extra],
    },
    {
      packageName: '@nocobase/app-plugin-foundation',
      source: 'plugin',
      routes: foundation,
    },
  ]).routes;
}

function flatten(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

describe('plugins page integration', () => {
  it('adds no build step: the plugin contributes no commands', () => {
    expect(
      cliPlugins.plugins.map((plugin) => plugin.packageName),
    ).not.toContain('@nocobase/app-plugin-foundation');
  });

  it('lists Plugins in System settings behind «Plugins · View»', () => {
    const routes = resolve();
    const category = buildSettingsCatalog(routes, new Set()).find(
      ({ route }) => route.name === 'systemSettings.system',
    );
    const plugins = category?.modules.find(
      ({ route }) => route.name === 'plugins',
    );
    expect(plugins?.target.path).toBe('/settings/plugins');
    expect(plugins?.route).toMatchObject({
      id: '@nocobase/app-plugin-foundation:plugins',
      auth: 'required',
      authz: PLUGINS_ACCESS,
    });
    expect(
      buildSettingsCatalog(routes, new Set([routeKey(plugins!.route)]))
        .flatMap((item) => item.modules)
        .some((item) => item.route.name === 'plugins'),
    ).toBe(false);
    expect(
      buildRouteNavigation(routes, new Set()).some(
        ({ route }) => route.name === 'plugins',
      ),
    ).toBe(false);
  });

  it('keeps Plugins in System when a business route is registered', () => {
    const routes = resolve(
      defineAppRoutes([
        {
          name: 'fixtureOrders',
          path: '/fixture-orders',
          auth: 'required',
          authz: {
            resource: { type: 'page', id: 'fixture-orders' },
            action: 'access',
          },
          navigation: { title: 'Orders' },
          componentLoader: async () => ({ default: () => null }),
        },
      ]),
    );
    const catalog = buildSettingsCatalog(routes, new Set());
    const modules = (name: string) =>
      catalog
        .find(({ route }) => route.name === name)
        ?.modules.map(({ route, target }) => [route.name, target.path]);
    expect(modules('settingsAccount')).toContainEqual([
      'settingsUsers',
      '/settings/users',
    ]);
    expect(modules('settingsAccount')).toContainEqual([
      'permissionManagement',
      '/settings/roles',
    ]);
    expect(modules('systemSettings.system')).toEqual([
      ['plugins', '/settings/plugins'],
    ]);
    const menuNames = buildRouteNavigation(routes, new Set()).map(
      ({ route }) => route.name,
    );
    expect(menuNames).toContain('fixtureOrders');
    expect(menuNames).not.toContain('plugins');
  });
});

it('sends the earlier Foundation and capability guide addresses to the plugins page', () => {
  const routes = resolve();
  const paths = flatten(routes)
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
  expect(
    flatten(routes).find((route) => route.name === 'plugins')?.authz,
  ).toEqual(PLUGINS_ACCESS);
});
