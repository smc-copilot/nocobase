import { Hono } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';

import { getMeetingOaSsoRuntime } from '../auth/oa-ltpa/runtime.js';
import { readNamedCookie } from '../meetings/oa/sso-cookie.js';
import { isMeetingOaSsoReady } from '../meetings/oa/sso-validator.js';

const OaSsoStatusSchema = z.object({
  enabled: z.boolean(),
  oaLoginUrl: z.string().url().optional(),
});

const OaSsoProbeSchema = z.object({
  cookiePresent: z.boolean(),
});

export const meetingOaSsoRoutes = defineApiRoutes((_app: Application) => {
  const router = new Hono();
  router.onError((error, c) => apiErrorHandler(error, c));

  router.get(
    '/meeting-oa-sso/status',
    describeRoute({
      tags: ['Meeting OA SSO'],
      operationId: 'getMeetingOaSsoStatus',
      summary: 'Whether OA single sign-on is enabled for the login page',
      responses: {
        200: dataResponse(OaSsoStatusSchema),
        ...apiErrorResponses,
      },
    }),
    (c) => {
      const config = getMeetingOaSsoRuntime().resolveConfig();
      const enabled = isMeetingOaSsoReady(config);
      c.header('Cache-Control', 'no-store');
      if (!enabled) return c.json({ data: { enabled: false } });
      return c.json({
        data: {
          enabled: true,
          ...(config.oaLoginUrl ? { oaLoginUrl: config.oaLoginUrl } : {}),
        },
      });
    },
  );

  router.get(
    '/meeting-oa-sso/probe',
    describeRoute({
      tags: ['Meeting OA SSO'],
      operationId: 'probeMeetingOaSsoCookie',
      summary:
        'PRE-02 probe: whether the configured OA session cookie reached Meeting (boolean only)',
      responses: {
        200: dataResponse(OaSsoProbeSchema),
        ...apiErrorResponses,
      },
    }),
    (c) => {
      const config = getMeetingOaSsoRuntime().resolveConfig();
      c.header('Cache-Control', 'no-store');
      if (!isMeetingOaSsoReady(config)) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'OA_SSO_NOT_ENABLED',
          domain: 'meeting-oa-sso',
          message: 'OA single sign-on is not enabled.',
        });
      }
      const cookie = readNamedCookie(c.req.header('cookie'), config.cookieName);
      return c.json({
        data: { cookiePresent: cookie.kind === 'ok' },
      });
    },
  );

  return new Hono().route('/', router);
});
