import { Hono } from 'hono';
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
import { createMeetingServices } from '../meetings/context.js';
import { MeetingGatewayError } from '../meetings/gateway/errors.js';
import { asMeetingOaApiError } from '../meetings/oa/errors.js';
import {
  MeetingContentEditBody,
  MeetingContentSchema,
  MeetingImportBody,
  MeetingParams,
  OaDraftSaveBody,
  OaDraftSchema,
  OaIdentitySchema,
  OaMapBody,
  OaOperationParams,
  OaOperationSchema,
  OaPeopleQuery,
  OaPersonSchema,
  OaReconcileBody,
  OaSettingsBody,
  OaSettingsSchema,
  OaSyncBody,
  TotalMeta,
} from './schemas.js';

export const meetingOaRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  router.onError((error, c) =>
    apiErrorHandler(
      error instanceof MeetingGatewayError
        ? error.toApiError()
        : asMeetingOaApiError(error),
      c,
    ),
  );
  const protect = [
    app.container.resolve(authenticationToken).required({ scopedKeys: false }),
    app.container.resolve(authorizationToken).middleware(),
  ] as const;
  const paths = [
    '/meetings/:meetingId/content',
    '/meetings/:meetingId/imports',
    '/meetings/:meetingId/oa-draft',
    '/meetings/:meetingId/oa-draft/refill',
    '/meetingOa/identity',
    '/meetingOa/identities',
    '/meetingOa/people',
    '/meetingOa/settings',
    '/meetingOa/operations',
    '/meetingOa/operations/:operationId',
    '/meetingOa/operations/:operationId/resume',
    '/meetingOa/operations/:operationId/reconcile',
    '/meetingOa/operations/:operationId/recover',
  ] as const;
  for (const path of paths) router.use(path, ...protect);
  if (!app.container.has(databaseManagerToken)) {
    const unavailable = () => {
      throw new ApiError({
        status: 'UNAVAILABLE',
        reason: 'DATABASE_UNAVAILABLE',
        domain: 'meetings',
        message: 'The database is unavailable.',
      });
    };
    for (const path of paths)
      router.all(path, describeRoute({ hide: true }), unavailable);
    return new Hono().route('/', router);
  }

  router.get(
    '/meetings/:meetingId/content',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingContent',
      summary: 'Read stored meeting transcripts and minutes',
      description:
        'Returns local content versions. Live gateway download is not claimed when the published client lacks record-file details.',
      responses: {
        200: dataResponse(MeetingContentSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MeetingParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).contents.get(
          c.req.valid('param').meetingId,
        ),
      }),
  );
  router.patch(
    '/meetings/:meetingId/content',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'editMeetingContent',
      summary: 'Save local transcript or minutes edits',
      description:
        'Local revisions are kept separately from imported source text. Re-import does not overwrite them.',
      responses: {
        200: dataResponse(MeetingContentSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MeetingParams),
    apiValidator('json', MeetingContentEditBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).contents.edit(
          c.req.valid('param').meetingId,
          c.req.valid('json'),
        ),
      }),
  );
  router.post(
    '/meetings/:meetingId/imports',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'importMeetingRecording',
      summary: 'Import a stored recording into local content versions',
      description:
        'Uses a stored recordFileId, never a client download URL. Without a published gateway record-file contract the run fails as IMPORT_CONTRACT_UNAVAILABLE.',
      responses: {
        200: dataResponse(MeetingContentSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MeetingParams),
    apiValidator('json', MeetingImportBody),
    async (c) => {
      const result = await createMeetingServices(
        app,
        c,
      ).contents.importRecording(
        c.req.valid('param').meetingId,
        c.req.valid('json').recordFileId,
      );
      return c.json({
        data: result.data,
        meta: { importRun: result.importRun },
      });
    },
  );
  router.get(
    '/meetings/:meetingId/oa-draft',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingOaDraft',
      summary: 'Read the OA workspace draft for a meeting',
      description: 'Saving or reading a draft never writes to OA.',
      responses: { 200: dataResponse(OaDraftSchema), ...apiErrorResponses },
    }),
    apiValidator('param', MeetingParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).drafts.get(
          c.req.valid('param').meetingId,
        ),
      }),
  );
  router.put(
    '/meetings/:meetingId/oa-draft',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'saveMeetingOaDraft',
      summary: 'Save an OA draft without writing OA',
      responses: { 200: dataResponse(OaDraftSchema), ...apiErrorResponses },
    }),
    apiValidator('param', MeetingParams),
    apiValidator('json', OaDraftSaveBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).drafts.save(
          c.req.valid('param').meetingId,
          c.req.valid('json'),
        ),
      }),
  );
  router.post(
    '/meetings/:meetingId/oa-draft/refill',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'refillMeetingOaDraft',
      summary: 'Refill OA draft fields from current meeting content',
      responses: { 200: dataResponse(OaDraftSchema), ...apiErrorResponses },
    }),
    apiValidator('param', MeetingParams),
    apiValidator('json', OaDraftSaveBody.pick({ expectedVersion: true })),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).drafts.refill(
          c.req.valid('param').meetingId,
          c.req.valid('json').expectedVersion,
        ),
      }),
  );
  router.get(
    '/meetingOa/identity',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingOaIdentity',
      summary: 'Read the signed-in user’s trusted OA mapping',
      description:
        'Identity is determined on the server. Missing mapping still allows saving a draft.',
      responses: { 200: dataResponse(OaIdentitySchema), ...apiErrorResponses },
    }),
    async (c) =>
      c.json({ data: await createMeetingServices(app, c).identity.current() }),
  );
  router.get(
    '/meetingOa/identities',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'listMeetingOaIdentities',
      summary: 'List trusted OA employee mappings',
      responses: {
        200: listResponse(OaIdentitySchema, TotalMeta),
        ...apiErrorResponses,
      },
    }),
    async (c) => {
      const data = await createMeetingServices(app, c).identity.listMaps();
      return c.json({ data, meta: { total: data.length } });
    },
  );
  router.put(
    '/meetingOa/identities',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'saveMeetingOaIdentity',
      summary: 'Create or update a trusted OA employee mapping',
      responses: { 200: dataResponse(OaIdentitySchema), ...apiErrorResponses },
    }),
    apiValidator('json', OaMapBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).identity.upsertMap(
          c.req.valid('json'),
        ),
      }),
  );
  router.get(
    '/meetingOa/people',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'searchMeetingOaPeople',
      summary: 'Search OA people by name',
      description:
        'HTTP search follows loudon84/anything-llm@codex/meeting-intelligence oaPeople.js: GET peopleUrl?fd_name=',
      responses: {
        200: listResponse(OaPersonSchema, TotalMeta),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', OaPeopleQuery),
    async (c) => {
      const data = await createMeetingServices(app, c).identity.searchPeople(
        c.req.valid('query').q,
      );
      return c.json({ data, meta: { total: data.length } });
    },
  );
  router.get(
    '/meetingOa/settings',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingOaSettings',
      summary: 'Read OA integration settings without secrets',
      responses: { 200: dataResponse(OaSettingsSchema), ...apiErrorResponses },
    }),
    async (c) =>
      c.json({ data: await createMeetingServices(app, c).oaSettings.get() }),
  );
  router.put(
    '/meetingOa/settings',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'saveMeetingOaSettings',
      summary: 'Save OA URLs and seal the client secret',
      responses: { 200: dataResponse(OaSettingsSchema), ...apiErrorResponses },
    }),
    apiValidator('json', OaSettingsBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).oaSettings.save(
          c.req.valid('json'),
        ),
      }),
  );
  router.get(
    '/meetingOa/operations',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'listMeetingOaReconcileOperations',
      summary: 'List UNKNOWN and PARTIAL OA operations for reconcile',
      description: 'GET is a pure read and does not advance write steps.',
      responses: {
        200: listResponse(OaOperationSchema, TotalMeta),
        ...apiErrorResponses,
      },
    }),
    async (c) => {
      const data = await createMeetingServices(app, c).operations.listUnknown();
      return c.json({ data, meta: { total: data.length } });
    },
  );
  router.post(
    '/meetingOa/operations',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'submitMeetingOaOperation',
      summary: 'Freeze a draft and register a unique OA create intent',
      responses: { 200: dataResponse(OaOperationSchema), ...apiErrorResponses },
    }),
    apiValidator('json', OaSyncBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).operations.submit(
          c.req.valid('json'),
        ),
      }),
  );
  router.get(
    '/meetingOa/operations/:operationId',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'getMeetingOaOperation',
      summary: 'Read one OA operation without advancing writes',
      responses: { 200: dataResponse(OaOperationSchema), ...apiErrorResponses },
    }),
    apiValidator('param', OaOperationParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).operations.get(
          c.req.valid('param').operationId,
        ),
      }),
  );
  router.post(
    '/meetingOa/operations/:operationId/resume',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'resumeMeetingOaOperation',
      summary:
        'Resume remaining unsent OA steps of a confirmed-failed operation',
      responses: { 200: dataResponse(OaOperationSchema), ...apiErrorResponses },
    }),
    apiValidator('param', OaOperationParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).operations.resume(
          c.req.valid('param').operationId,
        ),
      }),
  );
  router.post(
    '/meetingOa/operations/:operationId/reconcile',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'reconcileMeetingOaOperation',
      summary: 'Record reconcile evidence without writing OA',
      responses: { 200: dataResponse(OaOperationSchema), ...apiErrorResponses },
    }),
    apiValidator('param', OaOperationParams),
    apiValidator('json', OaReconcileBody),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).operations.reconcile(
          c.req.valid('param').operationId,
          c.req.valid('json'),
        ),
      }),
  );
  router.post(
    '/meetingOa/operations/:operationId/recover',
    describeRoute({
      tags: ['Meetings'],
      operationId: 'recoverMeetingOaOperation',
      summary: 'Continue a frozen intent after not_sent reconcile evidence',
      responses: { 200: dataResponse(OaOperationSchema), ...apiErrorResponses },
    }),
    apiValidator('param', OaOperationParams),
    async (c) =>
      c.json({
        data: await createMeetingServices(app, c).operations.recover(
          c.req.valid('param').operationId,
        ),
      }),
  );
  return new Hono().route('/', router);
});
