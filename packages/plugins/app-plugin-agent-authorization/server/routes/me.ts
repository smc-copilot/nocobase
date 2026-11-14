import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';

import { ERROR_DOMAIN } from '../config.js';
import type { AgentAuthorizationServices } from '../services/index.js';

type Env = { Variables: AuthEnv['Variables'] };

const tags = ['AgentAuthorizationMe'];

const GrantViewSchema = z.object({
  grantId: z.string(),
  clientId: z.string(),
  clientName: z.string().optional(),
  localUserId: z.string(),
  audience: z.string(),
  scopes: z.array(z.string()),
  revision: z.number(),
  status: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const GrantParams = z.object({
  grantId: z.string().min(1).max(64),
});

export function createMeRouter(options: {
  services: () => AgentAuthorizationServices;
  authenticate: MiddlewareHandler;
}): Hono {
  const router = new Hono();
  router.onError((error, context) => apiErrorHandler(error, context));
  router.use('*', options.authenticate);

  router.get(
    '/me/grants',
    describeRoute({
      tags,
      summary: 'List grants for the signed-in user',
      operationId: 'agentAuthorizationListMyGrants',
      responses: {
        200: listResponse(GrantViewSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const userId = (context as unknown as Context<Env>).get('auth')?.user.id;
      if (!userId) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTH_REQUIRED',
          domain: ERROR_DOMAIN,
          message: 'Sign in required',
        });
      }
      const data = await options.services().grants.listForUser(userId);
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.post(
    '/me/grants/:grantId/revoke',
    describeRoute({
      tags,
      summary: 'Revoke one of the signed-in user grants',
      operationId: 'agentAuthorizationRevokeMyGrant',
      responses: {
        200: dataResponse(
          z.object({
            grantId: z.string(),
            status: z.string(),
            revision: z.number(),
          }),
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', GrantParams),
    async (context) => {
      const userId = (context as unknown as Context<Env>).get('auth')?.user.id;
      if (!userId) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTH_REQUIRED',
          domain: ERROR_DOMAIN,
          message: 'Sign in required',
        });
      }
      const { grantId } = context.req.valid('param');
      const grants = await options.services().grants.listForUser(userId);
      const owned = grants.find((grant) => grant.grantId === grantId);
      if (!owned) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'NOT_FOUND',
          domain: ERROR_DOMAIN,
          message: 'Grant not found',
        });
      }
      const services = options.services();
      const revoked = await services.grants.revoke(grantId, userId);
      await services.audit.record({
        clientId: revoked.clientId,
        localUserId: userId,
        grantId: revoked.grantId,
        action: 'grant.revoke',
        decision: 'revoke',
        details: { via: 'me', revision: revoked.revision },
      });
      return context.json({
        data: {
          grantId: revoked.grantId,
          status: revoked.status,
          revision: revoked.revision,
        },
      });
    },
  );

  return router;
}
