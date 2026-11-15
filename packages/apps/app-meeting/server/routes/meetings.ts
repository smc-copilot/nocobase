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
  listResponse,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { MEETING_RESOURCE } from '../meetings/resources.js';
import { MeetingQueryService } from '../meetings/service.js';
import {
  MeetingListMeta,
  MeetingListQuery,
  MeetingParams,
  MeetingSchema,
} from './schemas.js';

const listDoc = describeRoute({
  tags: ['Meetings'],
  operationId: 'listMeetings',
  summary: 'List meetings the caller may read',
  description:
    'Returns meetings granted to the signed-in user. The list is empty until a later query import records access. It does not call a meeting gateway.',
  responses: {
    200: listResponse(MeetingSchema, MeetingListMeta),
    ...apiErrorResponses,
  },
});

const getDoc = describeRoute({
  tags: ['Meetings'],
  operationId: 'getMeeting',
  summary: 'Read one granted meeting',
  description:
    'Hidden and missing meetings both return 403. The response never includes gateway credentials or source tokens.',
  responses: {
    200: dataResponse(MeetingSchema),
    ...apiErrorResponses,
  },
});

export const meetingsRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.onError(apiErrorHandler);
  const requireMeetingRead = createMiddleware<AuthorizationEnv>(
    async (context, next) => {
      const decision = await context.get('authz').authorize({
        resource: { type: 'composite', id: MEETING_RESOURCE },
        action: 'read',
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
    requireMeetingRead,
  ] as const;
  router.use('/meetings', ...protect);
  router.use('/meetings/:meetingId', ...protect);
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
    router.get('/meetings', describeRoute({ hide: true }), unavailable);
    router.get(
      '/meetings/:meetingId',
      describeRoute({ hide: true }),
      unavailable,
    );
    return new Hono().route('/', router);
  }
  const database = app.container.resolve(databaseManagerToken);
  router.get(
    '/meetings',
    listDoc,
    apiValidator('query', MeetingListQuery),
    async (c) =>
      c.json(
        await new MeetingQueryService(
          database.connection(),
          c.get('authz'),
        ).list(c.req.valid('query')),
      ),
  );
  router.get(
    '/meetings/:meetingId',
    getDoc,
    apiValidator('param', MeetingParams),
    async (c) =>
      c.json({
        data: await new MeetingQueryService(
          database.connection(),
          c.get('authz'),
        ).get(c.req.valid('param').meetingId),
      }),
  );
  return new Hono().route('/', router);
});
