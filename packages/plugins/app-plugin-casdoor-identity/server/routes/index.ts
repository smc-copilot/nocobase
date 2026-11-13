import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorHandler,
  apiErrorResponses,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import { CASDOOR_ACCESS_TOKEN_SCHEME } from '../config.js';

const tags = ['CasdoorIdentity'];

const MeSchema = z.object({
  userId: z.string(),
  credentialType: z.string().optional(),
  credentialScheme: z.string().optional(),
});

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

/**
 * P0 demo surface: a protected route that proves an external JWT resolved into the native
 * auth context. Production Business UI routes land in a later plugin.
 */
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    if (!container.has(authenticationToken)) return router;

    const routes = new Hono<Env>();
    routes.onError((error, context) => apiErrorHandler(error, context));
    routes.use(
      '*',
      container.resolve(authenticationToken).required({ scopedKeys: true }),
    );
    if (container.has(authorizationToken)) {
      routes.use('*', container.resolve(authorizationToken).middleware());
    }

    routes.get(
      '/me',
      describeRoute({
        tags,
        summary:
          'Return the current user resolved from Casdoor or session auth',
        operationId: 'casdoorIdentityMe',
        security: [{ cookieAuth: [] }, { [CASDOOR_ACCESS_TOKEN_SCHEME]: [] }],
        responses: {
          200: dataResponse(MeSchema),
          ...apiErrorResponses,
        },
      }),
      (context) => {
        const auth = context.get('auth');
        return context.json({
          data: {
            userId: auth!.user.id,
            credentialType: auth?.credential?.type,
            credentialScheme: auth?.credential?.scheme,
          },
        });
      },
    );

    return router.route('/casdoorIdentity', routes);
  });

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
