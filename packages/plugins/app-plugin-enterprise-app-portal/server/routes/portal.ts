import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  describeRoute,
  listResponse,
  ApiError,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import { SETTINGS_AUDIT, SETTINGS_CATALOG } from '../config.js';
import type { EnterprisePortalServices } from '../services/composition.js';
import type { AccessIdentity } from '../services/casdoor-application-access.js';
import type { PortalApplicationRecord } from '../services/application-catalog.js';
import {
  AppCodeParam,
  AuditEventSchema,
  AuditQuery,
  CatalogApplicationSchema,
  CatalogCreateInput,
  CatalogUpdateInput,
  EmployeeCatalogSchema,
  LaunchResultSchema,
  PreferencesInput,
  PreferencesSchema,
} from './schemas.js';

const tags = ['EnterpriseAppPortal'];

type PortalEnv = { Variables: AuthEnv['Variables'] };

export interface PortalRouterOptions {
  readonly services: () => EnterprisePortalServices;
  readonly authenticate: MiddlewareHandler[];
  readonly authorize: (
    context: Context,
    item: string,
    action: string,
  ) => Promise<boolean>;
}

const forbidden = (item: string, action: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'PORTAL_ADMIN_FORBIDDEN',
    domain: 'enterpriseAppPortal',
    message: `The ${action} action on ${item} is required.`,
  });

function serializeCatalog(record: PortalApplicationRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function identityOf(context: Context<PortalEnv>): AccessIdentity {
  const auth = context.get('auth');
  if (!auth?.user.id) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: 'enterpriseAppPortal',
      message: 'A signed-in session is required.',
    });
  }
  const user = auth.user as {
    id: string;
    username?: string | null;
    name?: string | null;
  };
  return {
    userId: user.id,
    username: user.username ?? user.name ?? null,
  };
}

export function createPortalRouter(
  options: PortalRouterOptions,
): Hono<PortalEnv> {
  const router = new Hono<PortalEnv>();
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
  const services = options.services;

  router.get(
    '/applications',
    describeRoute({
      tags,
      summary: 'List applications the caller is authorized to launch',
      operationId: 'enterpriseAppPortalListAuthorizedApplications',
      ...cliRoute(false),
      description:
        'Casdoor application access is re-checked on every request. An unconfigured adapter answers 503 `CASDOOR_AUTHORIZATION_UNAVAILABLE`.',
      responses: {
        200: dataResponse(EmployeeCatalogSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor application access is unconfigured (`CASDOOR_AUTHORIZATION_UNAVAILABLE`).',
        ),
      },
    }),
    async (context) => {
      const data = await services().launch.listAuthorized(identityOf(context));
      return context.json({ data });
    },
  );

  router.post(
    '/applications/:appCode/launch',
    describeRoute({
      tags,
      summary:
        'Launch an authorized application after health and access rechecks',
      operationId: 'enterpriseAppPortalLaunchApplication',
      ...cliRoute(false),
      description:
        'Returns the server-composed HTTPS URL. Callers must not treat this as an open redirect; the host stays on the deployment allowlist.',
      responses: {
        200: dataResponse(LaunchResultSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The application is disabled or unhealthy (`APP_DISABLED`, `APP_UNHEALTHY`).',
        ),
        503: apiErrorResponse(
          503,
          'Casdoor application access is unconfigured (`CASDOOR_AUTHORIZATION_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('param', AppCodeParam),
    async (context) => {
      const { appCode } = context.req.valid('param');
      return context.json({
        data: await services().launch.launch(identityOf(context), appCode),
      });
    },
  );

  router.get(
    '/preferences',
    describeRoute({
      tags,
      summary: 'Get the caller portal launch preferences',
      operationId: 'enterpriseAppPortalGetPreferences',
      ...cliRoute(false),
      responses: {
        200: dataResponse(PreferencesSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const prefs = await services().preferences.get(
        identityOf(context).userId,
      );
      return context.json({
        data: { ...prefs, updatedAt: prefs.updatedAt.toISOString() },
      });
    },
  );

  router.put(
    '/preferences',
    describeRoute({
      tags,
      summary: 'Update the caller portal launch preferences',
      operationId: 'enterpriseAppPortalUpdatePreferences',
      ...cliRoute(false),
      responses: {
        200: dataResponse(PreferencesSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', PreferencesInput),
    async (context) => {
      const prefs = await services().preferences.upsert(
        identityOf(context).userId,
        context.req.valid('json'),
      );
      return context.json({
        data: { ...prefs, updatedAt: prefs.updatedAt.toISOString() },
      });
    },
  );

  router.get(
    '/admin/applications',
    permit(SETTINGS_CATALOG, 'read'),
    describeRoute({
      tags,
      summary: 'List catalog applications for administration',
      operationId: 'enterpriseAppPortalListCatalogApplications',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CATALOG}\` read. Catalog membership is not Casdoor authorization.`,
      responses: {
        200: listResponse(CatalogApplicationSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const applications = await services().catalog.list();
      return context.json({
        data: applications.map(serializeCatalog),
        meta: { total: applications.length },
      });
    },
  );

  router.post(
    '/admin/applications',
    permit(SETTINGS_CATALOG, 'configure'),
    describeRoute({
      tags,
      summary: 'Create a catalog application',
      operationId: 'enterpriseAppPortalCreateCatalogApplication',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CATALOG}\` configure. Saving a URL never expands the deployment host allowlist.`,
      responses: {
        200: dataResponse(CatalogApplicationSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(409, 'appCode already exists.'),
      },
    }),
    apiValidator('json', CatalogCreateInput),
    async (context) => {
      const record = await services().catalog.create(
        context.req.valid('json'),
        identityOf(context).userId,
      );
      return context.json({ data: serializeCatalog(record) });
    },
  );

  router.patch(
    '/admin/applications/:appCode',
    permit(SETTINGS_CATALOG, 'configure'),
    describeRoute({
      tags,
      summary: 'Update a catalog application',
      operationId: 'enterpriseAppPortalUpdateCatalogApplication',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CATALOG}\` configure.`,
      responses: {
        200: dataResponse(CatalogApplicationSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', AppCodeParam),
    apiValidator('json', CatalogUpdateInput),
    async (context) => {
      const record = await services().catalog.update(
        context.req.valid('param').appCode,
        context.req.valid('json'),
        identityOf(context).userId,
      );
      return context.json({ data: serializeCatalog(record) });
    },
  );

  router.get(
    '/admin/auditEvents',
    permit(SETTINGS_AUDIT, 'read'),
    describeRoute({
      tags,
      summary: 'List portal access and catalog audit events',
      operationId: 'enterpriseAppPortalListAuditEvents',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AUDIT}\` read. Events never include secrets or tokens.`,
      responses: {
        200: listResponse(AuditEventSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', AuditQuery),
    async (context) => {
      const events = await services().audit.list(
        context.req.valid('query').limit,
      );
      return context.json({
        data: events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
        meta: { total: events.length },
      });
    },
  );

  return router;
}
