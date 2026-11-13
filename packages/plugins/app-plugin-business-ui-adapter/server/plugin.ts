import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const businessUiAdapterPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-business-ui-adapter',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default businessUiAdapterPlugin;
