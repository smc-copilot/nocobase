import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import {
  SETTINGS_APPS,
  SETTINGS_AUDIT,
  SETTINGS_CONFLICTS,
  SETTINGS_IDENTITIES,
  SETTINGS_MEMBERSHIPS,
  SETTINGS_PERSONS,
  SETTINGS_PROVIDERS,
} from '../authorization.js';
import { hubError } from '../errors.js';
import type { ActorContext } from '../model.js';
import type { GrantMembershipInput } from '../services/apps.js';
import {
  appRegistryServiceToken,
  conflictQueueToken,
  identityAuditLogToken,
  identityLinkServiceToken,
  identitySyncServiceToken,
  membershipServiceToken,
  personServiceToken,
  providerRegistryToken,
} from '../tokens.js';
import {
  AppBodySchema,
  AppPatchSchema,
  AppParamsSchema,
  AppSchema,
  AuditEventSchema,
  ConflictListQuerySchema,
  ConflictParamsSchema,
  ConflictSchema,
  CreatePersonSchema,
  GrantMembershipSchema,
  IdentitySchema,
  LinkPreviewResultSchema,
  LinkPreviewSchema,
  LinkSchema,
  MembershipParamsSchema,
  MembershipSchema,
  PageMetaSchema,
  PageQuerySchema,
  PersonListQuerySchema,
  PersonParamsSchema,
  PersonSchema,
  ProviderBodySchema,
  ProviderHealthSchema,
  ProviderParamsSchema,
  ProviderPatchSchema,
  ProviderSchema,
  ResolveConflictSchema,
  SyncPreviewSchema,
  SyncRunSchema,
  UnlinkSchema,
  UpdatePersonSchema,
} from './schemas.js';

const tags = ['IdentityHub'];
const denied = {
  read: 'IDENTITY_HUB_ACCESS_REQUIRED',
  manage: 'IDENTITY_HUB_MANAGE_REQUIRED',
} as const;

type HubEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

function requireSettings(id: string, action: 'read' | 'manage') {
  return createMiddleware<HubEnv>(async (context, next) => {
    const allowed = await context.get('authz').can({
      resource: { type: 'settings', id },
      action,
    });
    if (!allowed) {
      throw hubError(
        'PERMISSION_DENIED',
        denied[action],
        action === 'read'
          ? 'Identity Hub read access is required.'
          : 'Identity Hub manage access is required.',
      );
    }
    await next();
  });
}

function actorOf(context: {
  get(key: 'auth'): HubEnv['Variables']['auth'];
}): ActorContext {
  const auth = context.get('auth');
  return { actorId: auth?.user?.id ?? null };
}

function readJson<T>(context: { req: { valid(target: 'json'): unknown } }): T {
  return context.req.valid('json') as T;
}

function readQuery<T>(context: {
  req: { valid(target: 'query'): unknown };
}): T {
  return context.req.valid('query') as T;
}

function readParam<T>(context: {
  req: { valid(target: 'param'): unknown };
}): T {
  return context.req.valid('param') as T;
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const root = new Hono();
    const router = new Hono<HubEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    router.onError((error, context) => apiErrorHandler(error, context));
    router.use('*', authentication.required(), authorization.middleware());

    const personsRead = requireSettings(SETTINGS_PERSONS, 'read');
    const personsManage = requireSettings(SETTINGS_PERSONS, 'manage');
    const providersRead = requireSettings(SETTINGS_PROVIDERS, 'read');
    const providersManage = requireSettings(SETTINGS_PROVIDERS, 'manage');
    const identitiesManage = requireSettings(SETTINGS_IDENTITIES, 'manage');
    const appsRead = requireSettings(SETTINGS_APPS, 'read');
    const appsManage = requireSettings(SETTINGS_APPS, 'manage');
    const membershipsRead = requireSettings(SETTINGS_MEMBERSHIPS, 'read');
    const membershipsManage = requireSettings(SETTINGS_MEMBERSHIPS, 'manage');
    const auditRead = requireSettings(SETTINGS_AUDIT, 'read');
    const conflictsRead = requireSettings(SETTINGS_CONFLICTS, 'read');
    const conflictsManage = requireSettings(SETTINGS_CONFLICTS, 'manage');

    const persons = () => container.resolve(personServiceToken);
    const providers = () => container.resolve(providerRegistryToken);
    const sync = () => container.resolve(identitySyncServiceToken);
    const identities = () => container.resolve(identityLinkServiceToken);
    const apps = () => container.resolve(appRegistryServiceToken);
    const memberships = () => container.resolve(membershipServiceToken);
    const audit = () => container.resolve(identityAuditLogToken);
    const conflicts = () => container.resolve(conflictQueueToken);

    router.get(
      '/identityHub/persons',
      personsRead,
      describeRoute({
        tags,
        summary: 'List persons',
        operationId: 'identityHubListPersons',
        description: 'Requires read on identityHub.persons.',
        responses: {
          200: listResponse(PersonSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PersonListQuerySchema),
      async (context) => {
        const page = await persons().list(readQuery(context));
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/persons',
      personsManage,
      describeRoute({
        tags,
        summary: 'Create a person',
        operationId: 'identityHubCreatePerson',
        description:
          'Requires manage on identityHub.persons. A duplicate employee number is queued as a conflict and answers 409. An optional manual identity is written in the same transaction.',
        responses: {
          200: dataResponse(PersonSchema),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('json', CreatePersonSchema),
      async (context) =>
        context.json({
          data: await persons().create(readJson(context), actorOf(context)),
        }),
    );

    router.get(
      '/identityHub/persons/:personId',
      personsRead,
      describeRoute({
        tags,
        summary: 'Get a person',
        operationId: 'identityHubGetPerson',
        description: 'Requires read on identityHub.persons.',
        responses: {
          200: dataResponse(PersonSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', PersonParamsSchema),
      async (context) =>
        context.json({
          data: await persons().get(
            readParam<{ personId: string }>(context).personId,
          ),
        }),
    );

    router.patch(
      '/identityHub/persons/:personId',
      personsManage,
      describeRoute({
        tags,
        summary: 'Update a person',
        operationId: 'identityHubUpdatePerson',
        description: 'Requires manage on identityHub.persons. Bumps version.',
        responses: {
          200: dataResponse(PersonSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('param', PersonParamsSchema),
      apiValidator('json', UpdatePersonSchema),
      async (context) =>
        context.json({
          data: await persons().update(
            readParam<{ personId: string }>(context).personId,
            readJson(context),
            actorOf(context),
          ),
        }),
    );

    for (const [verb, method, summary, operationId] of [
      ['disable', 'disable', 'Disable a person', 'identityHubDisablePerson'],
      ['enable', 'enable', 'Enable a person', 'identityHubEnablePerson'],
      ['archive', 'archive', 'Archive a person', 'identityHubArchivePerson'],
    ] as const) {
      router.post(
        `/identityHub/persons/:personId/${verb}`,
        personsManage,
        describeRoute({
          tags,
          summary,
          operationId,
          description: 'Requires manage on identityHub.persons. Bumps version.',
          responses: {
            200: dataResponse(PersonSchema),
            ...apiErrorResponses,
            400: apiErrorResponse(400),
            404: apiErrorResponse(404),
          },
        }),
        apiValidator('param', PersonParamsSchema),
        async (context) =>
          context.json({
            data: await persons()[method](
              readParam<{ personId: string }>(context).personId,
              actorOf(context),
            ),
          }),
      );
    }

    router.get(
      '/identityHub/providers',
      providersRead,
      describeRoute({
        tags,
        summary: 'List identity providers',
        operationId: 'identityHubListProviders',
        description: 'Requires read on identityHub.providers.',
        responses: {
          200: listResponse(ProviderSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PageQuerySchema),
      async (context) => {
        const page = await providers().list(readQuery(context));
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/providers',
      providersManage,
      describeRoute({
        tags,
        summary: 'Register an identity provider',
        operationId: 'identityHubCreateProvider',
        description:
          'Requires manage on identityHub.providers. Stores secretRef only, never a secret value.',
        responses: {
          200: dataResponse(ProviderSchema),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('json', ProviderBodySchema),
      async (context) =>
        context.json({
          data: await providers().create(readJson(context), actorOf(context)),
        }),
    );

    router.patch(
      '/identityHub/providers/:providerId',
      providersManage,
      describeRoute({
        tags,
        summary: 'Update an identity provider',
        operationId: 'identityHubUpdateProvider',
        description: 'Requires manage on identityHub.providers.',
        responses: {
          200: dataResponse(ProviderSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProviderParamsSchema),
      apiValidator('json', ProviderPatchSchema),
      async (context) =>
        context.json({
          data: await providers().update(
            readParam<{ providerId: string }>(context).providerId,
            readJson(context),
            actorOf(context),
          ),
        }),
    );

    router.post(
      '/identityHub/providers/:providerId/test',
      providersManage,
      describeRoute({
        tags,
        summary: 'Test an identity provider connection',
        operationId: 'identityHubTestProvider',
        description:
          'Requires manage on identityHub.providers. Calls the provider adapter health check and records lastHealthCheckAt.',
        responses: {
          200: dataResponse(ProviderHealthSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(400),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProviderParamsSchema),
      async (context) =>
        context.json({
          data: await sync().testConnection(
            readParam<{ providerId: string }>(context).providerId,
            actorOf(context),
          ),
        }),
    );

    router.post(
      '/identityHub/providers/:providerId/sync-preview',
      providersManage,
      describeRoute({
        tags,
        summary: 'Preview a provider directory sync',
        operationId: 'identityHubPreviewProviderSync',
        description:
          'Requires manage on identityHub.providers. Reads the first directory page and writes no person or identity rows.',
        responses: {
          200: dataResponse(SyncPreviewSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(400),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProviderParamsSchema),
      async (context) =>
        context.json({
          data: await sync().syncPreview(
            readParam<{ providerId: string }>(context).providerId,
            actorOf(context),
          ),
        }),
    );

    router.post(
      '/identityHub/providers/:providerId/sync-runs',
      providersManage,
      describeRoute({
        tags,
        summary: 'Run a provider directory sync',
        operationId: 'identityHubStartProviderSync',
        description:
          'Requires manage on identityHub.providers. Creates or links hub persons from the directory. A per-user failure is recorded on the run and does not disable other identities.',
        responses: {
          200: dataResponse(SyncRunSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(400),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProviderParamsSchema),
      async (context) =>
        context.json({
          data: await sync().syncRun(
            readParam<{ providerId: string }>(context).providerId,
            actorOf(context),
          ),
        }),
    );

    router.get(
      '/identityHub/providers/:providerId/sync-runs',
      providersRead,
      describeRoute({
        tags,
        summary: 'List provider sync runs',
        operationId: 'identityHubListProviderSyncRuns',
        description: 'Requires read on identityHub.providers.',
        responses: {
          200: listResponse(SyncRunSchema, PageMetaSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProviderParamsSchema),
      apiValidator('query', PageQuerySchema),
      async (context) => {
        const page = await sync().listSyncRuns(
          readParam<{ providerId: string }>(context).providerId,
          readQuery(context),
        );
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/identities/link-preview',
      identitiesManage,
      describeRoute({
        tags,
        summary: 'Preview an identity link',
        operationId: 'identityHubPreviewIdentityLink',
        description:
          'Requires manage on identityHub.identities. Email is never used to choose a person.',
        responses: {
          200: dataResponse(LinkPreviewResultSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', LinkPreviewSchema),
      async (context) =>
        context.json({
          data: await identities().linkPreview(readJson(context)),
        }),
    );

    router.post(
      '/identityHub/identities/link',
      identitiesManage,
      describeRoute({
        tags,
        summary: 'Link an identity to a person',
        operationId: 'identityHubLinkIdentity',
        description:
          'Requires manage on identityHub.identities. A unique constraint race answers 409.',
        responses: {
          200: dataResponse(IdentitySchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('json', LinkSchema),
      async (context) =>
        context.json({
          data: await identities().link(readJson(context), actorOf(context)),
        }),
    );

    router.post(
      '/identityHub/identities/unlink',
      identitiesManage,
      describeRoute({
        tags,
        summary: 'Unlink an identity',
        operationId: 'identityHubUnlinkIdentity',
        description:
          'Requires manage on identityHub.identities. The row is kept with status unlinked.',
        responses: {
          200: dataResponse(IdentitySchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('json', UnlinkSchema),
      async (context) =>
        context.json({
          data: await identities().unlink(readJson(context), actorOf(context)),
        }),
    );

    router.get(
      '/identityHub/apps',
      appsRead,
      describeRoute({
        tags,
        summary: 'List applications',
        operationId: 'identityHubListApps',
        description: 'Requires read on identityHub.apps.',
        responses: {
          200: listResponse(AppSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PageQuerySchema),
      async (context) => {
        const page = await apps().list(readQuery(context));
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/apps',
      appsManage,
      describeRoute({
        tags,
        summary: 'Register an application',
        operationId: 'identityHubCreateApp',
        description: 'Requires manage on identityHub.apps.',
        responses: {
          200: dataResponse(AppSchema),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('json', AppBodySchema),
      async (context) =>
        context.json({
          data: await apps().register(readJson(context), actorOf(context)),
        }),
    );

    router.patch(
      '/identityHub/apps/:appId',
      appsManage,
      describeRoute({
        tags,
        summary: 'Update an application',
        operationId: 'identityHubUpdateApp',
        description: 'Requires manage on identityHub.apps.',
        responses: {
          200: dataResponse(AppSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', AppParamsSchema),
      apiValidator('json', AppPatchSchema),
      async (context) =>
        context.json({
          data: await apps().update(
            readParam<{ appId: string }>(context).appId,
            readJson(context),
            actorOf(context),
          ),
        }),
    );

    router.get(
      '/identityHub/apps/:appId/memberships',
      membershipsRead,
      describeRoute({
        tags,
        summary: 'List application memberships',
        operationId: 'identityHubListMemberships',
        description: 'Requires read on identityHub.memberships.',
        responses: {
          200: listResponse(MembershipSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', AppParamsSchema),
      apiValidator('query', PageQuerySchema),
      async (context) => {
        const page = await memberships().list(
          readParam<{ appId: string }>(context).appId,
          readQuery(context),
        );
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/apps/:appId/memberships',
      membershipsManage,
      describeRoute({
        tags,
        summary: 'Grant an application membership',
        operationId: 'identityHubGrantMembership',
        description:
          'Requires manage on identityHub.memberships. A disabled person is rejected before a membership is written. Revoke of another application is unaffected.',
        responses: {
          200: dataResponse(MembershipSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(
            400,
            'The person is disabled or archived (`IDENTITY_HUB_PERSON_NOT_ACTIVE`).',
          ),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', AppParamsSchema),
      apiValidator('json', GrantMembershipSchema),
      async (context) => {
        const body = readJson<GrantMembershipInput>(context);
        return context.json({
          data: await memberships().grant(
            { ...body, appId: readParam<{ appId: string }>(context).appId },
            actorOf(context),
          ),
        });
      },
    );

    router.delete(
      '/identityHub/apps/:appId/memberships/:personId',
      membershipsManage,
      describeRoute({
        tags,
        summary: 'Revoke an application membership',
        operationId: 'identityHubRevokeMembership',
        description:
          'Requires manage on identityHub.memberships. Only the membership for this application is revoked.',
        responses: {
          200: dataResponse(MembershipSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', MembershipParamsSchema),
      async (context) => {
        return context.json({
          data: await memberships().revoke(
            readParam<{ appId: string; personId: string }>(context),
            actorOf(context),
          ),
        });
      },
    );

    router.get(
      '/identityHub/audit-events',
      auditRead,
      describeRoute({
        tags,
        summary: 'List audit events',
        operationId: 'identityHubListAuditEvents',
        description:
          'Requires read on identityHub.audit. Secret-like keys are redacted.',
        responses: {
          200: listResponse(AuditEventSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PageQuerySchema),
      async (context) => {
        const page = await audit().list(readQuery(context));
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.get(
      '/identityHub/conflicts',
      conflictsRead,
      describeRoute({
        tags,
        summary: 'List identity conflicts',
        operationId: 'identityHubListConflicts',
        description: 'Requires read on identityHub.conflicts.',
        responses: {
          200: listResponse(ConflictSchema, PageMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ConflictListQuerySchema),
      async (context) => {
        const page = await conflicts().list(readQuery(context));
        return context.json({
          data: page.items,
          meta: { total: page.total, page: page.page, pageSize: page.pageSize },
        });
      },
    );

    router.post(
      '/identityHub/conflicts/:conflictId/resolve',
      conflictsManage,
      describeRoute({
        tags,
        summary: 'Resolve an identity conflict',
        operationId: 'identityHubResolveConflict',
        description: 'Requires manage on identityHub.conflicts.',
        responses: {
          200: dataResponse(ConflictSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(400),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConflictParamsSchema),
      apiValidator('json', ResolveConflictSchema),
      async (context) =>
        context.json({
          data: await conflicts().resolve(
            readParam<{ conflictId: string }>(context).conflictId,
            readJson<{ status: 'resolved' | 'rejected' }>(context).status,
            actorOf(context),
          ),
        }),
    );

    root.route('/', router);
    return root;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
