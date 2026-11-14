import { KeyRound } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const clients = {
  resource: { type: 'settings', id: 'agentAuthorization.clients' },
  action: 'read',
} as const;

const grants = {
  resource: { type: 'settings', id: 'agentAuthorization.grants' },
  action: 'read',
} as const;

const audit = {
  resource: { type: 'settings', id: 'agentAuthorization.audit' },
  action: 'read',
} as const;

/**
 * Agent authorization administration inside the existing System settings category.
 * Tabs are the clients, grants, and audit views.
 */
const agentAuthorizationRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    parent: 'settingsSystem',
    name: 'agentAuthorizationAdmin',
    navigation: {
      title: 'agentAuthorization.title',
      description: 'agentAuthorization.description',
      icon: KeyRound,
    },
    breadcrumb: { title: 'agentAuthorization.title' },
    children: [
      {
        name: 'agentAuthorizationClients',
        path: '/agent-authorization/clients',
        auth: 'required',
        authz: clients,
        navigation: { title: 'agentAuthorization.clients' },
        breadcrumb: { title: 'agentAuthorization.clients' },
        componentLoader: () => import('./clients.js'),
      },
      {
        name: 'agentAuthorizationGrants',
        path: '/agent-authorization/grants',
        auth: 'required',
        authz: grants,
        navigation: { title: 'agentAuthorization.grants' },
        breadcrumb: { title: 'agentAuthorization.grants' },
        componentLoader: () => import('./grants.js'),
      },
      {
        name: 'agentAuthorizationAudit',
        path: '/agent-authorization/audit',
        auth: 'required',
        authz: audit,
        navigation: { title: 'agentAuthorization.audit' },
        breadcrumb: { title: 'agentAuthorization.audit' },
        componentLoader: () => import('./audit.js'),
      },
    ],
  },
]);

export default agentAuthorizationRoutes;
