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

import {
  ERROR_DOMAIN,
  SETTINGS_AUDIT,
  SETTINGS_CLIENTS,
  SETTINGS_GRANTS,
  SCOPES,
} from '../config.js';
import type { AgentAuthorizationServices } from '../services/index.js';

type Env = { Variables: AuthEnv['Variables'] };

const tags = ['AgentAuthorizationAdmin'];

const ClientViewSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  instanceLabel: z.string().nullable(),
  authMethod: z.string(),
  redirectUris: z.array(z.string()),
  allowedScopes: z.array(z.string()),
  allowedOrigins: z.array(z.string()),
  enabled: z.boolean(),
  secretVersion: z.number(),
  hasSecret: z.literal(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ClientCreatedSchema = ClientViewSchema.extend({
  clientSecret: z.string(),
});

const CreateClientInput = z.strictObject({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).nullable().optional(),
  instanceLabel: z.string().max(255).nullable().optional(),
  redirectUris: z.array(z.string().url()).min(1).max(50),
  allowedScopes: z.array(z.enum(SCOPES)).min(1).max(20),
  allowedOrigins: z.array(z.string().url()).max(50).optional(),
  authMethod: z.enum(['client_secret_post', 'client_secret_basic']).optional(),
  enabled: z.boolean().optional(),
});

const UpdateClientInput = z.strictObject({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1024).nullable().optional(),
  instanceLabel: z.string().max(255).nullable().optional(),
  redirectUris: z.array(z.string().url()).min(1).max(50).optional(),
  allowedScopes: z.array(z.enum(SCOPES)).min(1).max(20).optional(),
  allowedOrigins: z.array(z.string().url()).max(50).optional(),
  enabled: z.boolean().optional(),
});

const ClientParams = z.object({
  clientId: z.string().min(1).max(128),
});

const GrantParams = z.object({
  grantId: z.string().min(1).max(64),
});

const GrantQuery = z.object({
  clientId: z.string().min(1).max(128).optional(),
  localUserId: z.string().min(1).max(64).optional(),
});

function actorId(context: Context): string | undefined {
  return (context as unknown as Context<Env>).get('auth')?.user.id;
}

const forbidden = (item: string, action: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'AGENT_AUTHORIZATION_ADMIN_FORBIDDEN',
    domain: ERROR_DOMAIN,
    message: `The ${action} action on ${item} is required.`,
  });

export function createAdminRouter(options: {
  services: () => AgentAuthorizationServices;
  authenticate: MiddlewareHandler[];
  authorize: (
    context: Context,
    item: string,
    action: string,
  ) => Promise<boolean>;
}): Hono {
  const router = new Hono();
  router.onError((error, context) => apiErrorHandler(error, context));
  for (const middleware of options.authenticate) {
    router.use('*', middleware);
  }
  const permit =
    (item: string, action: string): MiddlewareHandler =>
    async (context, next) => {
      if (!(await options.authorize(context, item, action))) {
        throw forbidden(item, action);
      }
      await next();
    };

  router.get(
    '/clients',
    permit(SETTINGS_CLIENTS, 'read'),
    describeRoute({
      tags,
      summary: 'List agent clients',
      operationId: 'agentAuthorizationListClients',
      responses: {
        200: listResponse(ClientViewSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const data = await options.services().clients.list();
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.post(
    '/clients',
    permit(SETTINGS_CLIENTS, 'configure'),
    describeRoute({
      tags,
      summary: 'Register an agent client',
      operationId: 'agentAuthorizationCreateClient',
      responses: {
        200: dataResponse(ClientCreatedSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateClientInput),
    async (context) => {
      const input = context.req.valid('json');
      const services = options.services();
      const created = await services.clients.create(input);
      await services.audit.record({
        clientId: created.clientId,
        localUserId: actorId(context) ?? null,
        action: 'client.create',
        decision: 'allow',
        details: { name: created.name, enabled: created.enabled },
      });
      return context.json({ data: created });
    },
  );

  router.get(
    '/clients/:clientId',
    permit(SETTINGS_CLIENTS, 'read'),
    describeRoute({
      tags,
      summary: 'Get an agent client',
      operationId: 'agentAuthorizationGetClient',
      responses: {
        200: dataResponse(ClientViewSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', ClientParams),
    async (context) => {
      const { clientId } = context.req.valid('param');
      const client = await options.services().clients.get(clientId);
      if (!client) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'NOT_FOUND',
          domain: ERROR_DOMAIN,
          message: 'Client not found',
        });
      }
      return context.json({ data: client });
    },
  );

  router.patch(
    '/clients/:clientId',
    permit(SETTINGS_CLIENTS, 'configure'),
    describeRoute({
      tags,
      summary: 'Update an agent client',
      operationId: 'agentAuthorizationUpdateClient',
      responses: {
        200: dataResponse(ClientViewSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', ClientParams),
    apiValidator('json', UpdateClientInput),
    async (context) => {
      const { clientId } = context.req.valid('param');
      const input = context.req.valid('json');
      const services = options.services();
      const updated = await services.clients.update(clientId, input);
      await services.audit.record({
        clientId,
        localUserId: actorId(context) ?? null,
        action: 'client.update',
        decision: 'allow',
        details: {
          name: input.name,
          description: input.description,
          instanceLabel: input.instanceLabel,
          redirectUris: input.redirectUris
            ? [...input.redirectUris]
            : undefined,
          allowedScopes: input.allowedScopes
            ? [...input.allowedScopes]
            : undefined,
          allowedOrigins: input.allowedOrigins
            ? [...input.allowedOrigins]
            : undefined,
          enabled: input.enabled,
        },
      });
      return context.json({ data: updated });
    },
  );

  router.post(
    '/clients/:clientId/rotateSecret',
    permit(SETTINGS_CLIENTS, 'rotate'),
    describeRoute({
      tags,
      summary: 'Rotate an agent client secret',
      operationId: 'agentAuthorizationRotateClientSecret',
      responses: {
        200: dataResponse(ClientCreatedSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', ClientParams),
    async (context) => {
      const { clientId } = context.req.valid('param');
      const services = options.services();
      const rotated = await services.clients.rotateSecret(clientId);
      await services.audit.record({
        clientId,
        localUserId: actorId(context) ?? null,
        action: 'client.rotateSecret',
        decision: 'allow',
        details: { secretVersion: rotated.secretVersion },
      });
      return context.json({ data: rotated });
    },
  );

  router.get(
    '/grants',
    permit(SETTINGS_GRANTS, 'read'),
    describeRoute({
      tags,
      summary: 'List agent grants',
      operationId: 'agentAuthorizationListGrants',
      responses: {
        200: listResponse(
          z.object({
            grantId: z.string(),
            clientId: z.string(),
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
          }),
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', GrantQuery),
    async (context) => {
      const query = context.req.valid('query');
      const data = await options.services().grants.listAdmin(query);
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.post(
    '/grants/:grantId/revoke',
    permit(SETTINGS_GRANTS, 'revoke'),
    describeRoute({
      tags,
      summary: 'Revoke an agent grant',
      operationId: 'agentAuthorizationAdminRevokeGrant',
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
      const { grantId } = context.req.valid('param');
      const actor = actorId(context);
      const services = options.services();
      const revoked = await services.grants.revoke(grantId, actor);
      await services.audit.record({
        clientId: revoked.clientId,
        localUserId: actor ?? null,
        grantId: revoked.grantId,
        action: 'grant.revoke',
        decision: 'revoke',
        details: {
          via: 'admin',
          subjectUserId: revoked.localUserId,
          revision: revoked.revision,
        },
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

  router.get(
    '/auditEvents',
    permit(SETTINGS_AUDIT, 'read'),
    describeRoute({
      tags,
      summary: 'List agent authorization audit events',
      operationId: 'agentAuthorizationListAuditEvents',
      responses: {
        200: listResponse(z.record(z.string(), z.unknown())),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const data = await options.services().audit.list();
      return context.json({ data, meta: { total: data.length } });
    },
  );

  return router;
}
