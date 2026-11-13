import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { businessUiAdapterServiceToken } from '../tokens.js';
import { createAdminRouter } from './admin.js';
import { protocolRoutes } from './protocol.js';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    if (
      !container.has(authenticationToken) ||
      !container.has(businessUiAdapterServiceToken)
    ) {
      return router;
    }

    const authentication = container.resolve(authenticationToken);
    const authorization = container.has(authorizationToken)
      ? container.resolve(authorizationToken)
      : undefined;

    const admin = createAdminRouter({
      services: () => container.resolve(businessUiAdapterServiceToken),
      authenticate: [
        authentication.required(),
        ...(authorization ? [authorization.middleware()] : []),
      ],
      // Without the authorization plugin nothing can be granted, so nothing is allowed.
      authorize: async (context, item, action) =>
        authorization
          ? Boolean(
              await (context as Context<Env>).get('authz')?.can({
                resource: { type: 'settings', id: item },
                action,
              }),
            )
          : false,
    });

    return router.route('/businessUiAdapter', admin);
  });

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
  protocolRoutes,
];

export default routes;
