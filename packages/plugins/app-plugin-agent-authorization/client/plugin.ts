import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import routes from './routes.js';

const agentAuthorization: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-agent-authorization',
  routes,
});

export default agentAuthorization;
