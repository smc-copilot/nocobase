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

import type { AgentAuthorizationConfig } from '../config.js';
import { agentAuthorizationServiceToken } from '../tokens.js';
import { createAdminRouter } from './admin.js';
import { createMeRouter } from './me.js';
import { createOAuthRouter } from './oauth.js';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((application) => {
    const { container } = application;
    const router = new Hono();
    if (
      !container.has(authenticationToken) ||
      !container.has(agentAuthorizationServiceToken)
    ) {
      return router;
    }

    const authentication = container.resolve(authenticationToken);
    const authorization = container.has(authorizationToken)
      ? container.resolve(authorizationToken)
      : undefined;
    const services = () => container.resolve(agentAuthorizationServiceToken);
    const defaultAudience = () => {
      const config =
        application.config.get<AgentAuthorizationConfig>(
          'agentAuthorization',
        ) ?? {};
      return config.audience ?? 'http://localhost';
    };

    const oauth = createOAuthRouter({
      services,
      authenticate: authentication.required(),
      optionalAuthenticate: authentication.optional(),
      defaultAudience,
      publicBasePath: () => application.publicBasePath,
    });
    const me = createMeRouter({
      services,
      authenticate: authentication.required(),
    });
    const admin = createAdminRouter({
      services,
      authenticate: [
        authentication.required(),
        ...(authorization ? [authorization.middleware()] : []),
      ],
      authorize: async (context, item, action) =>
        authorization
          ? Boolean(
              await (context as unknown as Context<Env>).get('authz')?.can({
                resource: { type: 'settings', id: item },
                action,
              }),
            )
          : false,
    });

    return router
      .route('/agentAuthorization', oauth)
      .route('/agentAuthorization', me)
      .route('/agentAuthorization', admin);
  });

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
