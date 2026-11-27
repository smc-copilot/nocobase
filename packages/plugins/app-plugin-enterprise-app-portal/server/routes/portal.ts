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

import {
  SETTINGS_AUDIT,
  SETTINGS_CASDOOR,
  SETTINGS_CATALOG,
} from '../config.js';
import type { EnterprisePortalServices } from '../services/composition.js';
import { registerAgentGrantRoutes } from './agent-grants.js';
import type { AccessIdentity } from '../services/casdoor-application-access.js';
import type { PortalApplicationRecord } from '../services/application-catalog.js';
import {
  AppCodeParam,
  AuditEventSchema,
  ApplicationGrantReplaceInput,
  AuditQuery,
  CasdoorApplicationQuery,
  CasdoorApplicationSchema,
  CasdoorConnectionSchema,
  CasdoorGroupQuery,
  CasdoorGroupSchema,
  CasdoorUserGrantsSchema,
  CasdoorUserParam,
  CasdoorUserQuery,
  CasdoorUserSchema,
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

  router.post(
    '/admin/casdoor/testConnection',
    permit(SETTINGS_CASDOOR, 'read'),
    describeRoute({
      tags,
      summary: 'Test the Casdoor management connection',
      operationId: 'enterpriseAppPortalTestCasdoorConnection',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` read. Credentials stay on the server. A missing or rejected Casdoor answers 503 \`CASDOOR_MANAGEMENT_UNAVAILABLE\`.`,
      responses: {
        200: dataResponse(CasdoorConnectionSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    async (context) => {
      return context.json({ data: await services().grants.testConnection() });
    },
  );

  router.get(
    '/admin/casdoor/users',
    permit(SETTINGS_CASDOOR, 'read'),
    describeRoute({
      tags,
      summary: 'List Casdoor users for application grants',
      operationId: 'enterpriseAppPortalListCasdoorUsers',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` read. Passwords and access secrets are omitted. \`q\` filters Casdoor user name. \`groupName\` filters members of a Casdoor group by group name.`,
      responses: {
        200: listResponse(CasdoorUserSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('query', CasdoorUserQuery),
    async (context) => {
      const query = context.req.valid('query');
      const listed = await services().grants.listUsers({
        organization: query.organization,
        query: query.q,
        groupName: query.groupName,
        page: query.page,
        pageSize: query.pageSize,
      });
      return context.json({
        data: listed.users,
        meta: {
          total: listed.total,
          page: query.page,
          pageSize: query.pageSize,
        },
      });
    },
  );

  router.get(
    '/admin/casdoor/groups',
    permit(SETTINGS_CASDOOR, 'read'),
    describeRoute({
      tags,
      summary: 'List Casdoor groups for the organization tree',
      operationId: 'enterpriseAppPortalListCasdoorGroups',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` read. Returns every group page for the configured organization so the admin UI can build a parent/child tree. \`parentId\` is Casdoor's parent key (often the parent display name).`,
      responses: {
        200: listResponse(CasdoorGroupSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('query', CasdoorGroupQuery),
    async (context) => {
      const query = context.req.valid('query');
      const groups = await services().grants.listGroups({
        organization: query.organization,
      });
      return context.json({
        data: groups,
        meta: { total: groups.length },
      });
    },
  );

  router.get(
    '/admin/casdoor/applications',
    permit(SETTINGS_CASDOOR, 'read'),
    describeRoute({
      tags,
      summary: 'List Casdoor applications that can be granted',
      operationId: 'enterpriseAppPortalListCasdoorApplications',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` read. Client secrets are omitted.`,
      responses: {
        200: listResponse(CasdoorApplicationSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('query', CasdoorApplicationQuery),
    async (context) => {
      const query = context.req.valid('query');
      const listed = await services().grants.listApplications({
        owner: query.owner,
        page: query.page,
        pageSize: query.pageSize,
      });
      return context.json({
        data: listed.applications,
        meta: {
          total: listed.total,
          page: query.page,
          pageSize: query.pageSize,
        },
      });
    },
  );

  router.get(
    '/admin/users/:owner/:name/applicationGrants',
    permit(SETTINGS_CASDOOR, 'read'),
    describeRoute({
      tags,
      summary:
        'List direct and inherited application grants for a Casdoor user',
      operationId: 'enterpriseAppPortalGetUserApplicationGrants',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` read. The Casdoor user id is \`{owner}/{name}\`. Direct means the user is on the permission's user list. Inherited means enforce allows the user through a group, role, or wildcard.`,
      responses: {
        200: dataResponse(CasdoorUserGrantsSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('param', CasdoorUserParam),
    async (context) => {
      const { owner, name } = context.req.valid('param');
      return context.json({
        data: await services().grants.list(`${owner}/${name}`),
      });
    },
  );

  router.put(
    '/admin/users/:owner/:name/applicationGrants',
    permit(SETTINGS_CASDOOR, 'configure'),
    describeRoute({
      tags,
      summary: 'Replace direct application grants for a Casdoor user',
      operationId: 'enterpriseAppPortalUpdateUserApplicationGrants',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_CASDOOR}\` configure. Writes only \`nocobase-portal-app-<applicationName>\` permission user lists. Other permissions, other users, and group or role grants stay. The response is re-read and enforced.`,
      responses: {
        200: dataResponse(CasdoorUserGrantsSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The application is unknown (`APPLICATION_UNKNOWN`) or Casdoor did not converge (`GRANT_NOT_ENFORCED`, `GRANT_NOT_REVOKED`).',
        ),
        503: apiErrorResponse(
          503,
          'Casdoor management is not configured or did not answer (`CASDOOR_MANAGEMENT_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('param', CasdoorUserParam),
    apiValidator('json', ApplicationGrantReplaceInput),
    async (context) => {
      const { owner, name } = context.req.valid('param');
      const { applicationNames } = context.req.valid('json');
      return context.json({
        data: await services().grants.replace(
          `${owner}/${name}`,
          applicationNames,
        ),
      });
    },
  );

  registerAgentGrantRoutes(router, {
    services,
    permit,
    identityOf,
  });
  return router;
}
