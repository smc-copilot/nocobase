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
import type { AgentGrantOperationRecord } from '../services/agent-grant-operations.js';
import type { EnterprisePortalServices } from '../services/composition.js';
import type { PortalApplicationRecord } from '../services/application-catalog.js';
import {
  AgentGrantApplicationSchema,
  AgentGrantCreateInput,
  AgentGrantCreateOptionsSchema,
  AgentGrantEmployeeParam,
  AgentGrantOperationParam,
  AgentGrantOperationSchema,
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
      summary: 'List roles, permissions, and LDAP readiness for a create form',
      operationId: 'enterpriseAppPortalGetAgentGrantCreateOptions',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` read. Roles with system role admin are omitted. Directory mode is locked on.`,
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
      summary: 'Create an Octop directory user and optional default expert',
      operationId: 'enterpriseAppPortalCreateAgentGrant',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_AGENT_GRANTS}\` configure. The username comes from Casdoor. Directory is forced on and no password is sent. A timed-out create is not retried.`,
      responses: {
        200: dataResponse(AgentGrantOperationSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(
          409,
          'The Octop account already exists (`OCTOP_ACCOUNT_EXISTS`) or another create holds the lock (`AGENT_GRANT_OPERATION_IN_PROGRESS`).',
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
