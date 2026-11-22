import { ApiError } from '@nocobase/app-server/router';

import type { OctopApiAuthMode } from '../config.js';
import type { EnterpriseAppPortalConfig } from '../config.js';
import { portalError } from '../errors.js';
import type { AccessAuditLog } from './access-audit.js';
import type { ApplicationCatalogService } from './application-catalog.js';
import type { PortalApplicationRecord } from './application-catalog.js';
import {
  AgentGrantOperationStore,
  type AgentGrantOperationRecord,
} from './agent-grant-operations.js';
import { AgentGrantsReadService, matchOctopUser } from './agent-grants-read.js';
import type { CasdoorApplicationGrants } from './casdoor-application-grants.js';
import { buildOctopUserCreateBody } from './octop-create-request.js';
import {
  assertEnvName,
  assertGrantApplication,
} from './octop-instance-config.js';
import type {
  OctopAgent,
  OctopCreateUserResult,
  OctopManagementClient,
} from './octop-management-client.js';
import {
  assertOctopApiBaseUrl,
  type OctopUrlGuardOptions,
} from './octop-url-guard.js';

export interface AgentGrantCreateInput {
  readonly casdoorUserId: string;
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly role?: string;
  readonly permissions?: readonly string[];
  readonly workspaceRootDir?: string | null;
  readonly tokenQuota?: number | null;
  readonly maxAgents?: number | null;
  readonly allowedBackendTypes?: readonly string[];
  readonly createDefaultExpert?: boolean;
  readonly expertTemplateId?: string | null;
}

export interface OctopInstanceConfigInput {
  readonly agentGrantsEnabled: boolean;
  readonly apiBaseUrl: string | null;
  readonly apiAuthMode: OctopApiAuthMode | null;
  readonly apiTokenEnv: string | null;
  readonly apiUsernameEnv: string | null;
  readonly apiPasswordEnv: string | null;
}

export interface OctopConnectionTest {
  readonly ok: true;
  readonly authMode: OctopApiAuthMode;
  readonly healthOk: boolean;
}

const BLOCKED_REASONS = new Set([
  'CASDOOR_USER_NOT_AUTHORIZED',
  'OCTOP_TEMPLATE_NOT_FOUND',
  'OCTOP_CREATE_OPTIONS_INVALID',
  'OCTOP_DIRECTORY_NOT_CONFIGURED',
  'OCTOP_PERMISSION_NOT_ASSIGNABLE',
  'OCTOP_ROLE_TEMPLATE_NOT_FOUND',
  'OCTOP_USERNAME_AMBIGUOUS',
]);

/**
 * Creates one Octop directory user for one Casdoor employee.
 * The operation row and lock are stored before POST. A timed-out POST is not retried.
 * Octop users are never deleted from this service.
 */
export class AgentGrantsService {
  public constructor(
    private readonly catalog: ApplicationCatalogService,
    private readonly grants: CasdoorApplicationGrants,
    private readonly read: AgentGrantsReadService,
    private readonly operations: AgentGrantOperationStore,
    private readonly audit: AccessAuditLog,
    private readonly openClient: (
      app: PortalApplicationRecord,
    ) => Promise<OctopManagementClient>,
    private readonly guardOptions: () => OctopUrlGuardOptions,
    private readonly allowlist: () => readonly string[],
  ) {}

  public async saveInstanceConfig(
    appCode: string,
    input: OctopInstanceConfigInput,
    actorUserId: string,
  ): Promise<PortalApplicationRecord> {
    const current = await this.catalog.requireByCode(appCode);
    if (current.appType !== 'octop') {
      throw portalError(
        'FAILED_PRECONDITION',
        'APP_TYPE_NOT_SUPPORTED',
        'Agent Grants only supports Octop applications.',
      );
    }
    if (input.agentGrantsEnabled) {
      if (!input.apiBaseUrl || !input.apiAuthMode) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_API_NOT_CONFIGURED',
          'An enabled Octop grant target needs an API URL and auth mode.',
        );
      }
      await assertOctopApiBaseUrl(
        input.apiBaseUrl,
        this.allowlist(),
        this.guardOptions(),
      );
      if (input.apiAuthMode === 'bearer_env') assertEnvName(input.apiTokenEnv);
      if (input.apiAuthMode === 'password_login_env') {
        assertEnvName(input.apiUsernameEnv);
        assertEnvName(input.apiPasswordEnv);
      }
    }
    const updated = await this.catalog.update(appCode, input, actorUserId);
    await this.audit.record({
      actorUserId,
      appCode,
      action: 'agentGrant.configure',
      result: 'success',
      metadata: {
        agentGrantsEnabled: input.agentGrantsEnabled,
        apiAuthMode: input.apiAuthMode,
        apiTokenEnv: input.apiTokenEnv,
        apiUsernameEnv: input.apiUsernameEnv,
        apiPasswordEnv: input.apiPasswordEnv,
      },
    });
    return updated;
  }

  public async testConnection(appCode: string): Promise<OctopConnectionTest> {
    const app = await this.read.requireGrantApplication(appCode);
    assertGrantApplication(app);
    const client = await this.openClient(app);
    const health = await client.getHealth();
    if (!health.ok) {
      throw portalError(
        'UNAVAILABLE',
        'OCTOP_INSTANCE_UNAVAILABLE',
        'The Octop health check did not succeed.',
      );
    }
    return {
      ok: true,
      authMode: app.apiAuthMode as OctopApiAuthMode,
      healthOk: true,
    };
  }

  public getOperation(id: string): Promise<AgentGrantOperationRecord> {
    return this.operations.requireById(id);
  }

  public async createGrant(
    appCode: string,
    input: AgentGrantCreateInput,
    actorUserId: string,
  ): Promise<AgentGrantOperationRecord> {
    const app = await this.read.requireGrantApplication(appCode);
    const employee = await this.read.requireEmployee(input.casdoorUserId);
    const operation = await this.operations.acquire({
      appCode,
      casdoorUserId: input.casdoorUserId,
      username: employee.name,
      actorUserId,
      expertTemplateId: input.expertTemplateId ?? null,
      createOptionsSnapshot: {
        displayName: input.displayName ?? employee.displayName,
        email: input.email === undefined ? employee.email || null : input.email,
        role: input.role ?? 'user',
        directory: true,
        expertTemplateSource: 'published',
        createDefaultExpert: input.createDefaultExpert ?? true,
        expertTemplateId: input.expertTemplateId ?? null,
        permissions: input.permissions ?? null,
        workspaceRootDir: input.workspaceRootDir ?? null,
        tokenQuota: input.tokenQuota ?? null,
        maxAgents: input.maxAgents ?? null,
        allowedBackendTypes: input.allowedBackendTypes ?? null,
      },
    });
    let settled = false;
    let submitted = false;
    const finish = async (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ): Promise<AgentGrantOperationRecord> => {
      const row = await this.operations.transition(operation.id, patch);
      settled = true;
      await this.writeAudit(row);
      return row;
    };
    try {
      if (!app.casdoorAppKey) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_API_NOT_CONFIGURED',
          'This Octop application has no Casdoor application key.',
        );
      }
      const access = await this.grants.list(input.casdoorUserId);
      const allowed = access.grants.some(
        (grant) =>
          grant.applicationName === app.casdoorAppKey && grant.enforced,
      );
      if (!allowed) {
        await finish({
          status: 'BLOCKED',
          errorCode: 'CASDOOR_USER_NOT_AUTHORIZED',
          errorMessage:
            'Casdoor does not allow this employee for the application.',
        });
        throw portalError(
          'PERMISSION_DENIED',
          'CASDOOR_USER_NOT_AUTHORIZED',
          'Casdoor does not allow this employee to use the application.',
        );
      }
      const client = await this.openClient(app);
      const users = await client.getUsers();
      const existing = matchOctopUser(users, employee.name);
      if (existing) {
        await finish({
          status: 'ACCOUNT_EXISTS',
          errorCode: 'OCTOP_ACCOUNT_EXISTS',
          errorMessage:
            'The employee already has an Octop account. No user was created.',
          octopUserId: existing.id,
        });
        throw portalError(
          'ALREADY_EXISTS',
          'OCTOP_ACCOUNT_EXISTS',
          'The employee already has an Octop account. No user was created.',
          { octopUserId: existing.id },
        );
      }
      const body = await this.preflightCreate(client, input, employee);
      submitted = true;
      await this.operations.transition(operation.id, {
        status: 'SUBMITTING',
        createOptionsSnapshot: body,
        expertTemplateId:
          typeof body.expert_template_id === 'string'
            ? body.expert_template_id
            : null,
      });
      const created = await client.createUser(body);
      return await this.afterCreate(finish, created, body);
    } catch (error) {
      if (settled) throw error;
      if (submitted && isOutcomeUnknown(error)) {
        await finish({
          status: 'OUTCOME_UNKNOWN',
          errorCode: 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
          errorMessage: messageOf(error),
        });
        throw error;
      }
      if (submitted && isAccountExists(error)) {
        await this.noteConflict(finish, operation.username, app);
        throw error;
      }
      const reason = reasonOf(error);
      await finish({
        status:
          submitted || !BLOCKED_REASONS.has(reason)
            ? 'FAILED_NO_MUTATION'
            : 'BLOCKED',
        errorCode: reason,
        errorMessage: messageOf(error),
      });
      throw error;
    }
  }

  public async reconcile(
    operationId: string,
    actorUserId: string,
  ): Promise<AgentGrantOperationRecord> {
    const operation = await this.operations.requireById(operationId);
    if (
      operation.status !== 'OUTCOME_UNKNOWN' &&
      operation.status !== 'SUBMITTING' &&
      operation.status !== 'BOOTSTRAP_PENDING' &&
      operation.status !== 'USER_CREATED'
    ) {
      return operation;
    }
    const app = await this.catalog.requireByCode(operation.appCode);
    const client = await this.openClient(app);
    if (
      operation.status === 'OUTCOME_UNKNOWN' ||
      operation.status === 'SUBMITTING'
    ) {
      return this.reconcileUnknown(operation, client, actorUserId);
    }
    const agents = await client.getAgents('all');
    const agent = pickAgent(agents, operation);
    const status = classifyBootstrap(agent);
    const row = await this.operations.transition(operation.id, {
      status,
      agentId: agent?.agentId ?? operation.agentId,
      bootstrapStatus: agent
        ? agent.bootstrapPending
          ? 'pending'
          : 'ready'
        : operation.bootstrapStatus,
      errorCode: agent?.lastError ? 'OCTOP_BOOTSTRAP_FAILED' : null,
      errorMessage: agent?.lastError ?? null,
    });
    await this.writeAudit(row, actorUserId);
    return row;
  }

  private async preflightCreate(
    client: OctopManagementClient,
    input: AgentGrantCreateInput,
    employee: {
      readonly name: string;
      readonly displayName: string;
      readonly email: string;
    },
  ): Promise<Record<string, unknown>> {
    const createDefaultExpert = input.createDefaultExpert ?? true;
    const roles = await client.getRoles();
    const roleId = input.role ?? 'user';
    const role = roles.find((entry) => entry.id === roleId);
    if (!role) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_ROLE_TEMPLATE_NOT_FOUND',
        'The selected Octop role is not in the current role catalog.',
      );
    }
    if (role.systemRole?.toLowerCase() === 'admin') {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_CREATE_OPTIONS_INVALID',
        'Agent Grants cannot assign a role whose system role is admin.',
      );
    }
    const catalog = await client.getPermissions();
    const assignable = new Set(catalog.map((entry) => entry.key));
    const permissions = input.permissions
      ? [...input.permissions]
      : [...role.permissions];
    if (input.permissions?.some((key) => !assignable.has(key))) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_PERMISSION_NOT_ASSIGNABLE',
        'One or more permissions are not in the Octop assignable catalog.',
      );
    }
    const supported = new Set(
      roles
        .filter((entry) => entry.systemRole?.toLowerCase() !== 'admin')
        .flatMap((entry) => entry.allowedBackendTypes),
    );
    const backends = input.allowedBackendTypes
      ? [...input.allowedBackendTypes]
      : [...role.allowedBackendTypes];
    if (backends.some((backend) => !supported.has(backend))) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_CREATE_OPTIONS_INVALID',
        'One or more backend types are not supported by this Octop instance.',
      );
    }
    let templateId: string | null = null;
    if (createDefaultExpert) {
      if (!input.expertTemplateId) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_TEMPLATE_NOT_FOUND',
          'A published expert template is required when creating a default expert.',
        );
      }
      const templates = await client.getPublishedExperts();
      if (
        !templates.some((template) => template.id === input.expertTemplateId)
      ) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_TEMPLATE_NOT_FOUND',
          'The expert template is not in the published list for this Octop instance.',
        );
      }
      templateId = input.expertTemplateId;
    }
    const ldap = await client.getLdapConfig();
    if (!ldap.configured) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_DIRECTORY_NOT_CONFIGURED',
        'Octop LDAP is not enabled or has no bind password.',
      );
    }
    return buildOctopUserCreateBody({
      username: employee.name,
      displayName:
        input.displayName === undefined
          ? employee.displayName || null
          : input.displayName,
      email: input.email === undefined ? employee.email || null : input.email,
      role: role.id,
      roleName: role.name,
      permissions,
      workspaceRootDir: input.workspaceRootDir ?? null,
      tokenQuota: input.tokenQuota === undefined ? null : input.tokenQuota,
      maxAgents:
        input.maxAgents === undefined ? role.maxAgents : input.maxAgents,
      allowedBackendTypes: backends,
      createDefaultExpert,
      expertTemplateId: templateId,
    });
  }

  private async afterCreate(
    finish: (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ) => Promise<AgentGrantOperationRecord>,
    created: OctopCreateUserResult,
    body: Readonly<Record<string, unknown>>,
  ): Promise<AgentGrantOperationRecord> {
    if (body.create_default_expert !== true) {
      return finish({
        status: 'COMPLETED',
        octopUserId: created.id,
        errorCode: null,
        errorMessage: null,
      });
    }
    const expert = created.defaultExpert;
    return finish({
      status: 'USER_CREATED',
      octopUserId: created.id,
      agentId: expert?.agentId ?? null,
      bootstrapStatus: expert?.bootstrapStatus ?? null,
      expertTemplateId: expert?.templateId ?? null,
      errorCode: expert?.errorCode ?? null,
      errorMessage: expert?.errorMessage ?? null,
    }).then(async (row) => {
      const app = await this.catalog.requireByCode(row.appCode);
      try {
        const client = await this.openClient(app);
        const agents = await client.getAgents('all');
        const agent =
          (expert?.agentId
            ? agents.find((entry) => entry.agentId === expert.agentId)
            : undefined) ?? pickAgent(agents, row);
        const status = classifyBootstrap(agent);
        return finish({
          status,
          agentId: agent?.agentId ?? expert?.agentId ?? null,
          bootstrapStatus: agent
            ? agent.bootstrapPending
              ? 'pending'
              : 'ready'
            : (expert?.bootstrapStatus ?? null),
          errorCode:
            status === 'BOOTSTRAP_FAILED' ? 'OCTOP_BOOTSTRAP_FAILED' : null,
          errorMessage: agent?.lastError ?? expert?.errorMessage ?? null,
        });
      } catch {
        return finish({
          status: 'BOOTSTRAP_PENDING',
          errorCode: 'OCTOP_AGENT_LOOKUP_FAILED',
          errorMessage:
            'The user was created. The expert list could not be read, so bootstrap stays pending.',
        });
      }
    });
  }

  private async noteConflict(
    finish: (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ) => Promise<AgentGrantOperationRecord>,
    username: string,
    app: PortalApplicationRecord,
  ): Promise<void> {
    try {
      const client = await this.openClient(app);
      const users = await client.getUsers();
      const match = matchOctopUser(users, username);
      await finish({
        status: match ? 'ACCOUNT_EXISTS' : 'MANUAL_REVIEW',
        errorCode: match
          ? 'OCTOP_ACCOUNT_EXISTS'
          : 'AGENT_GRANT_RECONCILIATION_REQUIRED',
        octopUserId: match?.id ?? null,
        errorMessage: match
          ? 'Octop reported the username was taken. No further create was sent.'
          : 'Octop reported a conflict but the user could not be re-read.',
      });
    } catch {
      await finish({
        status: 'MANUAL_REVIEW',
        errorCode: 'AGENT_GRANT_RECONCILIATION_REQUIRED',
        errorMessage:
          'Octop reported a conflict and the follow-up read failed. No user was deleted.',
      });
    }
  }

  private async reconcileUnknown(
    operation: AgentGrantOperationRecord,
    client: OctopManagementClient,
    actorUserId: string,
  ): Promise<AgentGrantOperationRecord> {
    try {
      const users = await client.getUsers();
      const match = matchOctopUser(users, operation.username);
      const row = await this.operations.transition(operation.id, {
        status: match ? 'ACCOUNT_EXISTS_UNATTRIBUTED' : 'SAFE_TO_RETRY',
        octopUserId: match?.id ?? null,
        errorCode: match
          ? 'OCTOP_ACCOUNT_EXISTS'
          : 'AGENT_GRANT_RECONCILIATION_REQUIRED',
        errorMessage: match
          ? 'A matching Octop user exists. This operation did not retry the create.'
          : 'No matching Octop user exists. Submit a new grant to retry.',
      });
      await this.writeAudit(row, actorUserId);
      return row;
    } catch {
      const row = await this.operations.transition(operation.id, {
        status: 'MANUAL_REVIEW',
        errorCode: 'AGENT_GRANT_RECONCILIATION_REQUIRED',
        errorMessage:
          'The Octop user list could not be read. No create was retried.',
      });
      await this.writeAudit(row, actorUserId);
      return row;
    }
  }

  private async writeAudit(
    row: AgentGrantOperationRecord,
    actorUserId?: string,
  ): Promise<void> {
    try {
      await this.audit.record({
        actorUserId: actorUserId ?? row.actorUserId,
        appCode: row.appCode,
        action: 'agentGrant.create',
        result: auditResult(row.status),
        reason: row.errorCode,
        metadata: {
          operationId: row.id,
          status: row.status,
          casdoorUserId: row.casdoorUserId,
          username: row.username,
          octopUserId: row.octopUserId,
          agentId: row.agentId,
          errorCode: row.errorCode,
        },
      });
    } catch {
      if (row.status === 'COMPLETED') {
        await this.operations.transition(row.id, {
          errorCode: 'AGENT_GRANT_AUDIT_FAILED',
          errorMessage: 'The operation was stored but the audit record failed.',
        });
      }
    }
  }
}

function classifyBootstrap(
  agent: OctopAgent | undefined,
): 'COMPLETED' | 'BOOTSTRAP_PENDING' | 'BOOTSTRAP_FAILED' {
  if (!agent || agent.kind !== 'expert' || agent.bootstrapPending) {
    return 'BOOTSTRAP_PENDING';
  }
  if (agent.lastError) return 'BOOTSTRAP_FAILED';
  return 'COMPLETED';
}

function pickAgent(
  agents: readonly OctopAgent[],
  operation: AgentGrantOperationRecord,
): OctopAgent | undefined {
  if (operation.agentId) {
    const byId = agents.find((agent) => agent.agentId === operation.agentId);
    if (byId) return byId;
  }
  return agents.find(
    (agent) =>
      agent.kind === 'expert' &&
      (operation.expertTemplateId
        ? agent.publishedExpertId === operation.expertTemplateId
        : true) &&
      (operation.octopUserId
        ? agent.userId === operation.octopUserId
        : agent.ownerUsername === operation.username),
  );
}

function auditResult(
  status: AgentGrantOperationRecord['status'],
): 'success' | 'denied' | 'unavailable' | 'conflict' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'BLOCKED') return 'denied';
  if (
    status === 'ACCOUNT_EXISTS' ||
    status === 'ACCOUNT_EXISTS_UNATTRIBUTED' ||
    status === 'BOOTSTRAP_FAILED'
  ) {
    return 'conflict';
  }
  return 'unavailable';
}

function reasonOf(error: unknown): string {
  return error instanceof ApiError
    ? error.reason
    : 'OCTOP_USER_CREATE_REJECTED';
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : 'Octop request failed.';
  return text.slice(0, 500);
}

function isOutcomeUnknown(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.reason === 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN'
  );
}

function isAccountExists(error: unknown): boolean {
  return error instanceof ApiError && error.reason === 'OCTOP_ACCOUNT_EXISTS';
}

export function octopGuardOptionsFrom(
  config: EnterpriseAppPortalConfig,
): OctopUrlGuardOptions {
  return {
    allowHttp: config.octopApiAllowHttp === true,
    allowPrivateDns: config.octopApiAllowPrivateDns === true,
  };
}
