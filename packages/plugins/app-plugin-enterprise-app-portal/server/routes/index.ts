import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorHandler,
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { enterprisePortalServiceToken } from '../tokens.js';
import { createPortalRouter } from './portal.js';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    if (
      !container.has(authenticationToken) ||
      !container.has(enterprisePortalServiceToken)
    ) {
      return router;
    }

    const routes = new Hono<Env>();
    routes.onError((error, context) => apiErrorHandler(error, context));
    const authentication = container.resolve(authenticationToken);
    const authorization = container.has(authorizationToken)
      ? container.resolve(authorizationToken)
      : undefined;
    routes.route(
      '/',
      createPortalRouter({
        services: () => container.resolve(enterprisePortalServiceToken),
        authenticate: [
          authentication.required(),
          ...(authorization ? [authorization.middleware()] : []),
        ],
        authorize: async (context, item, action) =>
          authorization
            ? Boolean(
                await (context as Context<Env>).get('authz')?.can({
                  resource: { type: 'settings', id: item },
                  action,
                }),
              )
            : false,
      }) as unknown as Hono<Env>,
    );
    return router.route('/enterpriseAppPortal', routes);
  });

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
