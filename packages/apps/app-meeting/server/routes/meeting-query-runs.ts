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
  QueryRunCreateBody,
  QueryRunParams,
  QueryRunSchema,
} from './schemas.js';

export const meetingQueryRunRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.onError((error, c) =>
    apiErrorHandler(
      error instanceof MeetingGatewayError ? error.toApiError() : error,
      c,
    ),
  );
  const requireQuery = createMiddleware<AuthorizationEnv>(
    async (context, next) => {
      const decision = await context.get('authz').authorize({
        resource: { type: 'composite', id: MEETING_RESOURCE },
        action: 'query',
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
    requireQuery,
  ] as const;
  router.use('/meetingQueryRuns', ...protect);
  router.use('/meetingQueryRuns/:queryRunId', ...protect);
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
    router.post(
      '/meetingQueryRuns',
      describeRoute({ hide: true }),
      unavailable,
    );
    router.get(
      '/meetingQueryRuns/:queryRunId',
      describeRoute({ hide: true }),
      unavailable,
    );
    return new Hono().route('/', router);
  }
  router.post(
    '/meetingQueryRuns',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'createMeetingQueryRun',
      summary: 'Query the bound gateway for meetings in a time window',
      description:
        'Creates a durable QueryRun and talks to the gateway only when the caller posts. Page load does not start a query. The HTTP query envelope is unconfirmed; the isolation test adapter is the executable path. Failures do not delete stored meetings.',
      responses: {
        200: dataResponse(QueryRunSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', QueryRunCreateBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).queries.start(
          c.req.valid('json'),
        ),
      }),
  );
  router.get(
    '/meetingQueryRuns/:queryRunId',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingQueryRun',
      summary: 'Read one of the caller’s meeting query runs',
      responses: {
        200: dataResponse(QueryRunSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', QueryRunParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).queries.get(
          c.req.valid('param').queryRunId,
        ),
      }),
  );
  return new Hono().route('/', router);
});
