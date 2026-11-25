import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import type { Context, MiddlewareHandler } from 'hono';
import type { Hono } from 'hono';

import { SETTINGS_AGENT_GRANTS } from '../config.js';
import type {
  AgentGrantExpertItemRecord,
  AgentGrantOperationRecord,
} from '../services/agent-grant-operations.js';
import type { EnterprisePortalServices } from '../services/composition.js';
import type { PortalApplicationRecord } from '../services/application-catalog.js';
import {
  AgentGrantApplicationSchema,
  AgentGrantCreateInput,
  AgentGrantCreateOptionsSchema,
  AgentGrantEmployeeParam,
  AgentGrantExpertItemSchema,
  AgentGrantOperationParam,
  AgentGrantOperationSchema,
  AgentGrantRevokeUnsyncedSchema,
  AgentGrantUserSchema,
  AppCodeParam,
  AuthorizedEmployeeSchema,
  CatalogApplicationSchema,
  EmployeeOctopStateSchema,
  OctopConnectionTestSchema,
  OctopInstanceConfigInput,
  PublishedExpertSchema,
} from './schemas.js';

const tags = ['EnterpriseAppPortal'];

type PortalEnv = { Variables: AuthEnv['Variables'] };

export interface AgentGrantRouteOptions {
  readonly services: () => EnterprisePortalServices;
  readonly permit: (item: string, action: string) => MiddlewareHandler;
  readonly identityOf: (context: Context<PortalEnv>) => { userId: string };
}

function serializeCatalog(record: PortalApplicationRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeOperation(record: AgentGrantOperationRecord) {
  return {
    id: record.id,
    appCode: record.appCode,
    casdoorUserId: record.casdoorUserId,
    username: record.username,
    actorUserId: record.actorUserId,
    status: record.status,
    operationMode: record.operationMode,
    selectedExpertCount: record.selectedExpertCount,
    completedExpertCount: record.completedExpertCount,
    failedExpertCount: record.failedExpertCount,
    skippedExpertCount: record.skippedExpertCount,
    expertTemplateId: record.expertTemplateId,
    createOptionsSnapshot: record.createOptionsSnapshot,
    octopUserId: record.octopUserId,
    agentId: record.agentId,
    bootstrapStatus: record.bootstrapStatus,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
  };
}

function serializeExpertItem(record: AgentGrantExpertItemRecord) {
  return {
    id: record.id,
    operationId: record.operationId,
    expertTemplateId: record.expertTemplateId,
    expertName: record.expertName,
    status: record.status,
    agentId: record.agentId,
    bootstrapPending: record.bootstrapPending,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
  };
}

export function registerAgentGrantRoutes(
  router: Hono<PortalEnv>,
  options: AgentGrantRouteOptions,
): void {
  const { services, permit } = options;
  const read = permit(SETTINGS_AGENT_GRANTS, 'read');
  const configure = permit(SETTINGS_AGENT_GRANTS, 'configure');

  router.get(
    '/agentGrants/applications',
    read,
    describeRoute({
      tags,
      summary: 'List Octop applications with Agent Grants enabled',
      operationId: 'enterpriseAppPortalListAgentGrantApplications',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Only \`appType=octop\` rows with agent grants enabled are returned.`,
      responses: {
        200: listResponse(AgentGrantApplicationSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const data =
        await services().agentGrantsRead.listAgentGrantApplications();
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.put(
    '/agentGrants/applications/:appCode/instanceConfig',
    configure,
    describeRoute({
      tags,
      summary:
        'Replace the Octop management API connection for one application',
      operationId: 'enterpriseAppPortalUpdateAgentGrantInstanceConfig',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. Stores environment variable names, never secret values. The API URL is checked against the Octop host allowlist, not the launch URL allowlist.`,
      responses: {
        200: dataResponse(CatalogApplicationSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The application is not Octop or the API URL is not allowlisted (`APP_TYPE_NOT_SUPPORTED`, `OCTOP_API_URL_NOT_ALLOWED`, `OCTOP_API_NOT_CONFIGURED`).',
        ),
      },
    }),
    apiValidator('param', AppCodeParam),
    apiValidator('json', OctopInstanceConfigInput),
    async (context) => {
      const record = await services().agentGrants.saveInstanceConfig(
        context.req.valid('param').appCode,
        context.req.valid('json'),
        options.identityOf(context).userId,
      );
      return context.json({ data: serializeCatalog(record) });
    },
  );

  router.post(
    '/agentGrants/applications/:appCode/testConnection',
    configure,
    describeRoute({
      tags,
      summary: 'Test the Octop management API connection',
      operationId: 'enterpriseAppPortalTestAgentGrantConnection',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. Calls health only. Credentials stay on the server.`,
      responses: {
        200: dataResponse(OctopConnectionTestSchema),
        ...apiErrorResponses,
        503: apiErrorResponse(
          503,
          'Octop did not answer (`OCTOP_INSTANCE_UNAVAILABLE`, `OCTOP_API_TIMEOUT`, `OCTOP_CREDENTIAL_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('param', AppCodeParam),
    async (context) => {
      return context.json({
        data: await services().agentGrants.testConnection(
          context.req.valid('param').appCode,
        ),
      });
    },
  );

  router.get(
    '/agentGrants/users',
    read,
    describeRoute({
      tags,
      summary:
        'List authorized employees across every Agent Grants Octop instance',
      operationId: 'enterpriseAppPortalListAgentGrantUsers',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Returns one row per employee per enabled Octop instance, including Casdoor groups for the department column.`,
      responses: {
        200: listResponse(AgentGrantUserSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const data = await services().agentGrantsRead.listAgentGrantUsers();
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.get(
    '/agentGrants/applications/:appCode/employees',
    read,
    describeRoute({
      tags,
      summary: 'List Casdoor employees directly granted this Octop application',
      operationId: 'enterpriseAppPortalListAgentGrantEmployees',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Forbidden and deleted Casdoor users are omitted.`,
      responses: {
        200: listResponse(AuthorizedEmployeeSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', AppCodeParam),
    async (context) => {
      const data = await services().agentGrantsRead.listAuthorizedEmployees(
        context.req.valid('param').appCode,
      );
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.get(
    '/agentGrants/applications/:appCode/employees/:owner/:name/octopState',
    read,
    describeRoute({
      tags,
      summary: 'Read one employee Octop account and installed experts',
      operationId: 'enterpriseAppPortalGetEmployeeOctopState',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. The Casdoor user id is \`{owner}/{name}\`. Usernames are matched with NFKC trim and lower case.`,
      responses: {
        200: dataResponse(EmployeeOctopStateSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The Octop username is ambiguous (`OCTOP_USERNAME_AMBIGUOUS`).',
        ),
      },
    }),
    apiValidator('param', AgentGrantEmployeeParam),
    async (context) => {
      const { appCode, owner, name } = context.req.valid('param');
      return context.json({
        data: await services().agentGrantsRead.getEmployeeOctopState(
          appCode,
          `${owner}/${name}`,
        ),
      });
    },
  );

  router.delete(
    '/agentGrants/applications/:appCode/employees/:owner/:name',
    configure,
    describeRoute({
      tags,
      summary:
        'Revoke the direct Casdoor application grant for an unsynced employee',
      operationId: 'enterpriseAppPortalRevokeUnsyncedAgentGrantEmployee',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. Only employees without an Octop account may be removed. Inherited group or role grants are rejected. Does not delete the Casdoor user.`,
      responses: {
        200: dataResponse(AgentGrantRevokeUnsyncedSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The employee is synced (`OCTOP_ACCOUNT_EXISTS`) or only inherits the grant (`GRANT_INHERITED`).',
        ),
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', AgentGrantEmployeeParam),
    async (context) => {
      const { appCode, owner, name } = context.req.valid('param');
      const actor = options.identityOf(context);
      return context.json({
        data: await services().agentGrants.revokeUnsyncedEmployeeGrant(
          appCode,
          `${owner}/${name}`,
          actor.userId,
        ),
      });
    },
  );

  router.get(
    '/agentGrants/applications/:appCode/templates',
    read,
    describeRoute({
      tags,
      summary: 'List published expert templates on one Octop instance',
      operationId: 'enterpriseAppPortalListAgentGrantTemplates',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Templates come from the selected instance's published list.`,
      responses: {
        200: listResponse(PublishedExpertSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', AppCodeParam),
    async (context) => {
      const data = await services().agentGrantsRead.listTemplates(
        context.req.valid('param').appCode,
      );
      return context.json({ data, meta: { total: data.length } });
    },
  );

  router.get(
    '/agentGrants/applications/:appCode/createOptions',
    read,
    describeRoute({
      tags,
      summary: 'List roles and LDAP readiness for the simplified create form',
      operationId: 'enterpriseAppPortalGetAgentGrantCreateOptions',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Roles with system role admin are omitted. Permissions inherit from the selected role. Backend type is fixed to docker.`,
      responses: {
        200: dataResponse(AgentGrantCreateOptionsSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', AppCodeParam),
    async (context) => {
      return context.json({
        data: await services().agentGrantsRead.listCreateOptions(
          context.req.valid('param').appCode,
        ),
      });
    },
  );

  router.post(
    '/agentGrants/applications/:appCode/grants',
    configure,
    describeRoute({
      tags,
      summary:
        'Create an Octop user with a default expert, or install experts for an existing user',
      operationId: 'enterpriseAppPortalCreateAgentGrant',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. Username, display name, and email are resolved from Casdoor. Permissions inherit from the selected role. Backend type is fixed to docker. Default expert is only sent for new users. Confirm password is never accepted. A timed-out create is not retried.`,
      responses: {
        200: dataResponse(AgentGrantOperationSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(
          409,
          'Another create holds the lock (`AGENT_GRANT_OPERATION_IN_PROGRESS`).',
        ),
      },
    }),
    apiValidator('param', AppCodeParam),
    apiValidator('json', AgentGrantCreateInput),
    async (context) => {
      const operation = await services().agentGrants.createGrant(
        context.req.valid('param').appCode,
        context.req.valid('json'),
        options.identityOf(context).userId,
      );
      return context.json({ data: serializeOperation(operation) });
    },
  );

  router.get(
    '/agentGrants/operations/:operationId',
    read,
    describeRoute({
      tags,
      summary: 'Read one agent grant operation',
      operationId: 'enterpriseAppPortalGetAgentGrantOperation',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. The snapshot has passwords and tokens removed.`,
      responses: {
        200: dataResponse(AgentGrantOperationSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', AgentGrantOperationParam),
    async (context) => {
      const operation = await services().agentGrants.getOperation(
        context.req.valid('param').operationId,
      );
      return context.json({ data: serializeOperation(operation) });
    },
  );

  router.get(
    '/agentGrants/operations/:operationId/expertItems',
    read,
    describeRoute({
      tags,
      summary: 'List expert items for one agent grant operation',
      operationId: 'enterpriseAppPortalListAgentGrantExpertItems',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read.`,
      responses: {
        200: listResponse(AgentGrantExpertItemSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', AgentGrantOperationParam),
    async (context) => {
      const items = await services().agentGrants.listExpertItems(
        context.req.valid('param').operationId,
      );
      return context.json({
        data: items.map(serializeExpertItem),
        meta: { total: items.length },
      });
    },
  );

  router.post(
    '/agentGrants/operations/:operationId/reconcile',
    configure,
    describeRoute({
      tags,
      summary: 'Reconcile an unknown or pending agent grant operation',
      operationId: 'enterpriseAppPortalReconcileAgentGrantOperation',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. Reads Octop. Does not send another create and does not delete an Octop user.`,
      responses: {
        200: dataResponse(AgentGrantOperationSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', AgentGrantOperationParam),
    async (context) => {
      const operation = await services().agentGrants.reconcile(
        context.req.valid('param').operationId,
        options.identityOf(context).userId,
      );
      return context.json({ data: serializeOperation(operation) });
    },
  );
}
