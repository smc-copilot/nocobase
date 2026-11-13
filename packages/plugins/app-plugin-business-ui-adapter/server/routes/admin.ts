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

import { SETTINGS_CONNECTIONS, SETTINGS_FORMS } from '../config.js';
import { ERROR_DOMAIN, ProtocolError } from '../errors.js';
import type { ProtocolServices } from '../services/protocol.js';

const tags = ['BusinessUiAdapter'];

const ConnectionSchema = z.object({
  connectionId: z.string(),
  octopIssuer: z.string(),
  allowedOrigins: z.array(z.string()),
  enabled: z.boolean(),
});

const FormSchema = z.object({
  formRef: z.string(),
  schemaVersion: z.string(),
  mode: z.string(),
  handlerKey: z.string(),
  documentType: z.string(),
  enabled: z.boolean(),
});

const UpsertConnectionInput = z.strictObject({
  connectionId: z.string().min(1).max(128),
  octopIssuer: z.string().url().max(512),
  allowedOrigins: z.array(z.string().url()).max(50),
  serviceSecret: z.string().min(8).max(255),
  enabled: z.boolean().optional(),
});

const UpsertFormInput = z.strictObject({
  formRef: z.string().min(1).max(255),
  schemaVersion: z.string().min(1).max(64),
  mode: z.enum(['edit', 'detail']),
  handlerKey: z.string().min(1).max(128),
  documentType: z.string().max(128).optional(),
  permissionRef: z.string().max(255).nullable().optional(),
  enabled: z.boolean().optional(),
});

function mapError(error: unknown): never {
  if (error instanceof ProtocolError) {
    const status =
      error.status === 401
        ? 'UNAUTHENTICATED'
        : error.status === 403
          ? 'PERMISSION_DENIED'
          : error.status === 404
            ? 'NOT_FOUND'
            : error.status === 409
              ? 'ABORTED'
              : 'INVALID_ARGUMENT';
    throw new ApiError({
      status,
      reason: error.code,
      domain: ERROR_DOMAIN,
      message: error.message,
    });
  }
  throw error;
}

const forbidden = (item: string, action: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'BUSINESS_UI_ADMIN_FORBIDDEN',
    domain: ERROR_DOMAIN,
    message: `The ${action} action on ${item} is required.`,
  });

export function createAdminRouter(options: {
  services: () => ProtocolServices;
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

  router.post(
    '/connections',
    permit(SETTINGS_CONNECTIONS, 'configure'),
    describeRoute({
      tags,
      summary: 'Create or update a Business UI connection',
      operationId: 'businessUiAdapterUpsertConnection',
      responses: {
        200: dataResponse(ConnectionSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', UpsertConnectionInput),
    async (context) => {
      try {
        const input = context.req.valid('json');
        const row = await options.services().upsertConnection(input);
        return context.json({
          data: {
            connectionId: row.connectionId,
            octopIssuer: row.octopIssuer,
            allowedOrigins: row.allowedOrigins as string[],
            enabled: row.enabled,
          },
        });
      } catch (error) {
        mapError(error);
      }
    },
  );

  router.post(
    '/forms',
    permit(SETTINGS_FORMS, 'configure'),
    describeRoute({
      tags,
      summary: 'Create or update a registered Business UI form',
      operationId: 'businessUiAdapterUpsertForm',
      responses: {
        200: dataResponse(FormSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', UpsertFormInput),
    async (context) => {
      try {
        const input = context.req.valid('json');
        const row = await options.services().upsertForm(input);
        return context.json({
          data: {
            formRef: row.formRef,
            schemaVersion: row.schemaVersion,
            mode: row.mode,
            handlerKey: row.handlerKey,
            documentType: row.documentType,
            enabled: row.enabled,
          },
        });
      } catch (error) {
        mapError(error);
      }
    },
  );

  router.get(
    '/forms',
    permit(SETTINGS_FORMS, 'read'),
    describeRoute({
      tags,
      summary: 'List registered Business UI forms (configuration list)',
      operationId: 'businessUiAdapterListForms',
      responses: {
        200: listResponse(FormSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const rows = await options.services().listForms();
      return context.json({
        data: rows.map((row) => ({
          formRef: row.formRef,
          schemaVersion: row.schemaVersion,
          mode: row.mode,
          handlerKey: row.handlerKey,
          documentType: row.documentType,
          enabled: row.enabled,
        })),
        meta: { total: rows.length },
      });
    },
  );

  return router;
}
