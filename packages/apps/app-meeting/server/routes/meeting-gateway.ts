import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { MEETING_RESOURCE } from '../meetings/resources.js';
import { createMeetingServices } from '../meetings/context.js';
import { MeetingGatewayError } from '../meetings/gateway/errors.js';
import {
  GatewayBindingParams,
  GatewayBindingSchema,
  GatewayCompleteBody,
  GatewayConfigSchema,
  GatewaySelectBody,
  GatewayStartSchema,
  OauthCallbackQuery,
} from './schemas.js';

export const meetingGatewayRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.onError((error, c) =>
    apiErrorHandler(
      error instanceof MeetingGatewayError ? error.toApiError() : error,
      c,
    ),
  );
  const requireManage = createMiddleware<AuthorizationEnv>(
    async (context, next) => {
      const decision = await context.get('authz').authorize({
        resource: { type: 'composite', id: MEETING_RESOURCE },
        action: 'manageConnections',
      });
      if (decision.effect === 'deny') {
        throw new AuthorizationDeniedError(decision);
      }
      await next();
    },
  );
  const protect = [
    app.container.resolve(authenticationToken).required({ scopedKeys: false }),
    app.container.resolve(authorizationToken).middleware(),
    requireManage,
  ] as const;
  router.use('/meetingGateway/config', ...protect);
  router.use('/meetingGateway/bindings', ...protect);
  router.use('/meetingGateway/bindings/start', ...protect);
  router.use('/meetingGateway/bindings/complete', ...protect);
  router.use('/meetingGateway/bindings/:bindingId/select', ...protect);
  router.use('/meetingGateway/bindings/:bindingId/disconnect', ...protect);
  router.use(
    '/meetingGateway/oauth/callback',
    app.container.resolve(authenticationToken).required({ scopedKeys: false }),
    app.container.resolve(authorizationToken).middleware(),
  );
  if (!app.container.has(databaseManagerToken)) {
    const unavailable = () => {
      throw new ApiError({
        status: 'UNAVAILABLE',
        reason: 'DATABASE_UNAVAILABLE',
        domain: 'meetings',
        message: 'The database is unavailable.',
      });
    };
    // Hidden because this fallback exists only while the database is unconfigured.
    router.get(
      '/meetingGateway/config',
      describeRoute({ hide: true }),
      unavailable,
    );
    return new Hono().route('/', router);
  }
  router.get(
    '/meetingGateway/config',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingGatewayConfig',
      summary: 'Read the desensitized meeting gateway configuration status',
      description:
        'Never returns origins’ secrets, client secrets, tokens or signed URLs. Identity issuance is unavailable until a confirmed first mt_ grant exists.',
      responses: {
        200: dataResponse(GatewayConfigSchema),
        ...apiErrorResponses,
      },
    }),
    async (c) =>
      c.json({ data: createMeetingServices(app, c).gateway.configStatus() }),
  );
  router.get(
    '/meetingGateway/bindings',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingGatewayBinding',
      summary: 'Read the current user’s meeting gateway binding',
      description:
        'Bindings are always resolved for the signed-in user. The response never includes tokens.',
      responses: {
        200: dataResponse(GatewayBindingSchema),
        ...apiErrorResponses,
      },
    }),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).gateway.getBinding(),
      }),
  );
  router.post(
    '/meetingGateway/bindings/start',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'startMeetingGatewayBinding',
      summary: 'Start meeting gateway OAuth for the signed-in user',
      description:
        'Creates a single-use, user-bound local state. GET never consumes it. The authorization URL is the only secret-free redirect the page may open.',
      responses: {
        200: dataResponse(GatewayStartSchema),
        ...apiErrorResponses,
      },
    }),
    async (c) =>
      c.json({ data: await createMeetingServices(app, c).gateway.start() }),
  );
  router.post(
    '/meetingGateway/bindings/complete',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'completeMeetingGatewayBinding',
      summary: 'Consume local OAuth state and bind the current user',
      description:
        'The body state must belong to the signed-in user. Replay, expiry and another user’s state are refused. userId is never taken from the body.',
      responses: {
        200: dataResponse(GatewayBindingSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', GatewayCompleteBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).gateway.complete(
          c.req.valid('json').state,
        ),
      }),
  );
  router.post(
    '/meetingGateway/bindings/:bindingId/select',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'selectMeetingGatewayConnection',
      summary: 'Select a connection from the caller’s authorized set',
      description:
        'The connection id is checked against listConnections for this user. Body userId and foreign connection ids are ignored and refused.',
      responses: {
        200: dataResponse(GatewayBindingSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', GatewayBindingParams),
    apiValidator('json', GatewaySelectBody),
    async (c) => {
      const services = createMeetingServices(app, c);
      const binding = await services.gateway.getBinding();
      if (binding.id !== c.req.valid('param').bindingId) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: 'meetings',
          message: 'This meeting gateway binding is unavailable.',
        });
      }
      return c.json({
        data: await services.gateway.select(c.req.valid('json').connectionId),
      });
    },
  );
  router.post(
    '/meetingGateway/bindings/:bindingId/disconnect',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'disconnectMeetingGatewayBinding',
      summary: 'Disconnect this App from the user’s gateway binding',
      description:
        'Stops later remote access from this App. Upstream Tencent/gateway revoke is not supported and is never claimed.',
      responses: {
        200: dataResponse(GatewayBindingSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', GatewayBindingParams),
    async (c) => {
      const services = createMeetingServices(app, c);
      const binding = await services.gateway.getBinding();
      if (binding.id !== c.req.valid('param').bindingId) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: 'meetings',
          message: 'This meeting gateway binding is unavailable.',
        });
      }
      return c.json({ data: await services.gateway.disconnect() });
    },
  );
  router.get(
    '/meetingGateway/oauth/callback',
    // Browser-only OAuth return; GET must not consume state.
    describeRoute({ hide: true }),
    apiValidator('query', OauthCallbackQuery),
    async (c) =>
      c.json({
        data: createMeetingServices(app, c).gateway.peekCallback(
          c.req.valid('query').state,
        ),
      }),
  );
  return new Hono().route('/', router);
});
