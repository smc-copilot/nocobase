import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'authorize',
    path: '/agent-authorization/authorize',
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/authorize.js'),
  },
  {
    name: 'consent',
    path: '/agent-authorization/consent',
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/consent.js'),
  },
  {
    name: 'grants',
    path: '/agent-authorization/grants',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'grants.navigation' },
    componentLoader: () => import('./pages/my-grants.js'),
  },
]);

export default routes;
