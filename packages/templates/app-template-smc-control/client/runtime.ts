import defaultConfigs from './config/index.js';
import { createAppClientConfig } from '@nocobase/app-client';
import { defineAppRuntime } from '@nocobase/app-client/runtime';

import locales from './locales/index.js';
import plugins from './plugins.js';
import reactProviders from './react-providers.js';
import { createApplicationRoutes } from './routes.js';
import serviceProviders from './service-provider.js';

const appRuntime = defineAppRuntime({
  packageName: '@nocobase/app-template-smc-control',
  createAppConfig: createAppClientConfig,
  defaultConfigs,
  serviceProviders,
  locales,
  reactProviders,
  routes: () => createApplicationRoutes(),
  plugins,
  // These plugin pages use the same addresses as this application's own settings and inbox pages.
  excludedRouteIds: [
    '@nocobase/app-plugin-notification-in-app:inbox',
    '@nocobase/app-plugin-users:settingsUsers',
    '@nocobase/app-plugin-authorization:settingsRoles',
    '@nocobase/app-plugin-authorization:settingsDefaultAccess',
  ],
});

export default appRuntime;
