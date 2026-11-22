import { ApiError } from '@nocobase/app-server/router';

import type { OctopApiAuthMode } from '../config.js';
import type { EnterpriseAppPortalConfig } from '../config.js';
import { portalError } from '../errors.js';
import type { AccessAuditLog } from './access-audit.js';
import type { ApplicationCatalogService } from './application-catalog.js';
import type { PortalApplicationRecord } from './application-catalog.js';
import {
  AgentGrantOperationStore,
  type AgentGrantExpertItemRecord,
  type AgentGrantOperationRecord,
} from './agent-grant-operations.js';
import { AgentGrantsReadService, matchOctopUser } from './agent-grants-read.js';
import type { CasdoorApplicationGrants } from './casdoor-application-grants.js';
import {
  buildOctopUserCreateBody,
  normalizeOctopIdentityField,
} from './octop-create-request.js';
import {
  assertEnvName,
  assertGrantApplication,
} from './octop-instance-config.js';
import type {
  OctopAgent,
  OctopCreateUserResult,
  OctopManagementClient,
  OctopPublishedExpert,
  OctopRole,
  OctopUser,
} from './octop-management-client.js';
import {
  assertOctopApiBaseUrl,
  type OctopUrlGuardOptions,
} from './octop-url-guard.js';

export interface AgentGrantCreateInput {
  readonly casdoorUserId: string;
  readonly role?: string;
  readonly workspaceRootDir?: string | null;
  readonly tokenQuota?: number | null;
  readonly maxAgents?: number | null;
  readonly directory?: boolean;
  readonly password?: string | null;
  readonly expertTemplateIds: readonly string[];
  readonly defaultExpertTemplateId?: string | null;
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
  'OCTOP_DEFAULT_EXPERT_INVALID',
  'OCTOP_MAX_AGENTS_EXCEEDED',
  'PASSWORD_CONFIRM_MISMATCH',
  'PASSWORD_TOO_WEAK',
]);

/**
 * Creates one Octop user (when missing) and installs selected published experts.
 * Default expert is pushed only on new-user create. Existing users get install-only.
 * Passwords and tokens are never written into operations or audit.
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

  public async listExpertItems(
    operationId: string,
  ): Promise<readonly AgentGrantExpertItemRecord[]> {
    await this.operations.requireById(operationId);
    return this.operations.listExpertItems(operationId);
  }

  /**
   * Revokes the direct Casdoor application grant for an unsynced employee.
   * Does not delete the Casdoor user or touch Octop. Inherited-only access is
   * rejected; if access remains via group/role after revoke, stillAuthorized
   * is true.
   */
  public async revokeUnsyncedEmployeeGrant(
    appCode: string,
    casdoorUserId: string,
    actorUserId: string,
  ): Promise<{
    readonly casdoorUserId: string;
    readonly applicationName: string;
    readonly stillAuthorized: boolean;
  }> {
    const app = await this.read.requireGrantApplication(appCode);
    if (!app.casdoorAppKey) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_API_NOT_CONFIGURED',
        'This Octop application has no Casdoor application key.',
      );
    }
    const state = await this.read.getEmployeeOctopState(appCode, casdoorUserId);
    if (state.accountExists) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_ACCOUNT_EXISTS',
        'Synced Octop accounts cannot be removed from this list. Revoke only unsynced employees.',
      );
    }
    const current = await this.grants.list(casdoorUserId);
    const target = current.grants.find(
      (grant) => grant.applicationName === app.casdoorAppKey && grant.enforced,
    );
    if (!target) {
      throw portalError(
        'NOT_FOUND',
        'APPLICATION_GRANT_NOT_FOUND',
        'This employee is not authorized for the application.',
      );
    }
    if (target.source !== 'direct') {
      throw portalError(
        'FAILED_PRECONDITION',
        'GRANT_INHERITED',
        'This employee inherits the application through a Casdoor group or role. Remove that membership instead.',
      );
    }
    const remainingDirect = current.grants
      .filter(
        (grant) =>
          grant.source === 'direct' &&
          grant.applicationName !== app.casdoorAppKey,
      )
      .map((grant) => grant.applicationName);
    const after = await this.grants.replace(casdoorUserId, remainingDirect);
    const stillAuthorized = after.grants.some(
      (grant) => grant.applicationName === app.casdoorAppKey && grant.enforced,
    );
    await this.audit.record({
      actorUserId,
      appCode,
      action: 'agentGrant.revokeUnsynced',
      result: 'success',
      metadata: {
        casdoorUserId,
        applicationName: app.casdoorAppKey,
        stillAuthorized,
      },
    });
    return {
      casdoorUserId,
      applicationName: app.casdoorAppKey,
      stillAuthorized,
    };
  }

  public async createGrant(
    appCode: string,
    input: AgentGrantCreateInput,
    actorUserId: string,
  ): Promise<AgentGrantOperationRecord> {
    const app = await this.read.requireGrantApplication(appCode);
    const employee = await this.read.requireEmployee(input.casdoorUserId);
    const templateIds = uniqueIds(input.expertTemplateIds);
    if (templateIds.length === 0) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_TEMPLATE_NOT_FOUND',
        'At least one published expert template is required.',
      );
    }

    const operation = await this.operations.acquire({
      appCode,
      casdoorUserId: input.casdoorUserId,
      username: normalizeOctopIdentityField(employee.name),
      actorUserId,
      selectedExpertCount: templateIds.length,
      expertTemplateId: input.defaultExpertTemplateId ?? null,
      createOptionsSnapshot: {
        role: input.role ?? 'user',
        directory: input.directory !== false,
        expertTemplateSource: 'published',
        expertTemplateIds: templateIds,
        defaultExpertTemplateId: input.defaultExpertTemplateId ?? null,
        workspaceRootDir: input.workspaceRootDir ?? null,
        tokenQuota: input.tokenQuota ?? null,
        maxAgents: input.maxAgents ?? null,
        allowedBackendTypes: ['docker'],
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
      const templates = await client.getPublishedExperts();
      const templateById = new Map(templates.map((entry) => [entry.id, entry]));
      for (const templateId of templateIds) {
        if (!templateById.has(templateId)) {
          throw portalError(
            'FAILED_PRECONDITION',
            'OCTOP_TEMPLATE_NOT_FOUND',
            'One or more expert templates are not in the published list.',
          );
        }
      }

      if (existing) {
        return await this.installForExistingUser({
          finish,
          operation,
          client,
          existing,
          templateIds,
          templateById,
          input,
        });
      }

      return await this.createUserAndInstall({
        finish,
        operation,
        client,
        employee,
        templateIds,
        templateById,
        input,
        markSubmitted: () => {
          submitted = true;
        },
      });
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
      operation.status !== 'USER_CREATED' &&
      operation.status !== 'PARTIAL' &&
      operation.status !== 'EXPERT_INSTALL_FAILED'
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
    const items = await this.operations.listExpertItems(operation.id);
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let pending = false;
    for (const item of items) {
      if (item.status === 'ALREADY_INSTALLED') {
        skipped += 1;
        continue;
      }
      const agent =
        (item.agentId
          ? agents.find((entry) => entry.agentId === item.agentId)
          : undefined) ??
        agents.find(
          (entry) =>
            entry.kind === 'expert' &&
            entry.publishedExpertId === item.expertTemplateId &&
            (operation.octopUserId
              ? entry.userId === operation.octopUserId
              : true),
        );
      const status = classifyExpertBootstrap(agent);
      if (status === 'BOOTSTRAP_PENDING') pending = true;
      if (status === 'COMPLETED' || status === 'ALREADY_INSTALLED') {
        completed += 1;
      }
      if (status === 'FAILED') failed += 1;
      await this.operations.updateExpertItem(item.id, {
        status,
        agentId: agent?.agentId ?? item.agentId,
        bootstrapPending: agent
          ? agent.bootstrapPending
          : item.bootstrapPending,
        errorCode: agent?.lastError ? 'OCTOP_BOOTSTRAP_FAILED' : item.errorCode,
        errorMessage: agent?.lastError ?? item.errorMessage,
        completedAt:
          status === 'COMPLETED' || status === 'FAILED'
            ? new Date()
            : item.completedAt,
      });
    }

    const parentStatus = summarizeParentStatus({
      completed,
      failed,
      skipped,
      pending,
      total: items.length,
    });
    const row = await this.operations.transition(operation.id, {
      status: parentStatus,
      completedExpertCount: completed,
      failedExpertCount: failed,
      skippedExpertCount: skipped,
      errorCode: failed > 0 ? 'OCTOP_EXPERT_INSTALL_FAILED' : null,
      errorMessage:
        failed > 0
          ? 'One or more expert installs failed. Successful experts were kept.'
          : null,
    });
    await this.writeAudit(row, actorUserId);
    return row;
  }

  private async createUserAndInstall(args: {
    readonly finish: (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ) => Promise<AgentGrantOperationRecord>;
    readonly operation: AgentGrantOperationRecord;
    readonly client: OctopManagementClient;
    readonly employee: {
      readonly name: string;
      readonly displayName: string;
      readonly email: string;
    };
    readonly templateIds: readonly string[];
    readonly templateById: ReadonlyMap<string, OctopPublishedExpert>;
    readonly input: AgentGrantCreateInput;
    readonly markSubmitted: () => void;
  }): Promise<AgentGrantOperationRecord> {
    const {
      finish,
      operation,
      client,
      employee,
      templateIds,
      templateById,
      input,
      markSubmitted,
    } = args;
    const defaultExpertId = input.defaultExpertTemplateId ?? null;
    if (!defaultExpertId || !templateIds.includes(defaultExpertId)) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_DEFAULT_EXPERT_INVALID',
        'New users require a default expert selected from the install list.',
      );
    }

    const body = await this.preflightCreate(
      client,
      input,
      employee,
      defaultExpertId,
    );
    const createMaxAgents =
      typeof body.max_agents === 'number' ? body.max_agents : null;
    this.assertMaxAgents(createMaxAgents, 0, templateIds.length);
    markSubmitted();
    await this.operations.transition(operation.id, {
      status: 'SUBMITTING',
      operationMode: 'CREATE_USER_AND_INSTALL',
      createOptionsSnapshot: body,
      expertTemplateId: defaultExpertId,
      selectedExpertCount: templateIds.length,
    });

    for (const templateId of templateIds) {
      const template = templateById.get(templateId)!;
      await this.operations.createExpertItem({
        operationId: operation.id,
        expertTemplateId: templateId,
        expertName: template.name ?? templateId,
        status: 'PENDING',
      });
    }

    const created = await client.createUser(body);
    await this.operations.transition(operation.id, {
      status: 'USER_CREATED',
      octopUserId: created.id,
      agentId: created.defaultExpert?.agentId ?? null,
      bootstrapStatus: created.defaultExpert?.bootstrapStatus ?? null,
      expertTemplateId: defaultExpertId,
    });

    const items = await this.operations.listExpertItems(operation.id);
    const defaultItem = items.find(
      (item) => item.expertTemplateId === defaultExpertId,
    );
    if (defaultItem) {
      const defaultStatus = classifyDefaultExpert(created.defaultExpert);
      await this.operations.updateExpertItem(defaultItem.id, {
        status: defaultStatus,
        agentId: created.defaultExpert?.agentId ?? null,
        bootstrapPending:
          created.defaultExpert?.bootstrapStatus === 'pending' ||
          defaultStatus === 'BOOTSTRAP_PENDING',
        errorCode: created.defaultExpert?.errorCode ?? null,
        errorMessage: created.defaultExpert?.errorMessage ?? null,
        startedAt: new Date(),
        completedAt:
          defaultStatus === 'COMPLETED' || defaultStatus === 'FAILED'
            ? new Date()
            : null,
      });
    }

    const remaining = templateIds.filter((id) => id !== defaultExpertId);
    await this.installTemplatesSequentially({
      operationId: operation.id,
      client,
      octopUserId: created.id,
      templateIds: remaining,
      templateById,
    });

    return this.finalizeOperation(operation.id, finish);
  }

  private async installForExistingUser(args: {
    readonly finish: (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ) => Promise<AgentGrantOperationRecord>;
    readonly operation: AgentGrantOperationRecord;
    readonly client: OctopManagementClient;
    readonly existing: OctopUser;
    readonly templateIds: readonly string[];
    readonly templateById: ReadonlyMap<string, OctopPublishedExpert>;
    readonly input: AgentGrantCreateInput;
  }): Promise<AgentGrantOperationRecord> {
    const {
      finish,
      operation,
      client,
      existing,
      templateIds,
      templateById,
      input,
    } = args;
    if (input.defaultExpertTemplateId) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_DEFAULT_EXPERT_INVALID',
        'Existing users must leave defaultExpertTemplateId empty.',
      );
    }
    if (existing.disabled) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_ACCOUNT_DISABLED',
        'The Octop account is disabled. Experts cannot be installed.',
      );
    }

    const agents = await client.getAgents('all');
    const owned = agents.filter(
      (agent) =>
        agent.kind === 'expert' &&
        (agent.userId === existing.id ||
          (agent.ownerUsername != null &&
            agent.ownerUsername.toLowerCase() ===
              existing.username.toLowerCase())),
    );
    const installed = new Set(
      owned
        .map((agent) => agent.publishedExpertId)
        .filter((id): id is string => Boolean(id)),
    );

    await this.operations.transition(operation.id, {
      status: 'SUBMITTING',
      operationMode: 'INSTALL_ONLY',
      octopUserId: existing.id,
      selectedExpertCount: templateIds.length,
      expertTemplateId: null,
    });

    const toInstall: string[] = [];
    for (const templateId of templateIds) {
      const template = templateById.get(templateId)!;
      const already = installed.has(templateId);
      const item = await this.operations.createExpertItem({
        operationId: operation.id,
        expertTemplateId: templateId,
        expertName: template.name ?? templateId,
        status: already ? 'ALREADY_INSTALLED' : 'PENDING',
      });
      if (already) {
        const existingAgent = owned.find(
          (agent) => agent.publishedExpertId === templateId,
        );
        await this.operations.updateExpertItem(item.id, {
          status: 'ALREADY_INSTALLED',
          agentId: existingAgent?.agentId ?? null,
          bootstrapPending: existingAgent?.bootstrapPending ?? false,
          completedAt: new Date(),
        });
      } else {
        toInstall.push(templateId);
      }
    }

    if (toInstall.length === 0) {
      return finish({
        status: 'COMPLETED',
        operationMode: 'INSTALL_ONLY',
        octopUserId: existing.id,
        completedExpertCount: 0,
        failedExpertCount: 0,
        skippedExpertCount: templateIds.length,
        errorCode: null,
        errorMessage: null,
      });
    }

    // Append must use the target account quota, not role defaults from the
    // request body (PRD: do not rewrite existing user resource policies).
    this.assertMaxAgents(existing.maxAgents, owned.length, toInstall.length);

    await this.installTemplatesSequentially({
      operationId: operation.id,
      client,
      octopUserId: existing.id,
      templateIds: toInstall,
      templateById,
    });

    return this.finalizeOperation(operation.id, finish);
  }

  private async installTemplatesSequentially(args: {
    readonly operationId: string;
    readonly client: OctopManagementClient;
    readonly octopUserId: string;
    readonly templateIds: readonly string[];
    readonly templateById: ReadonlyMap<string, OctopPublishedExpert>;
  }): Promise<void> {
    const { operationId, client, octopUserId, templateIds, templateById } =
      args;
    const items = await this.operations.listExpertItems(operationId);
    for (const templateId of templateIds) {
      const item = items.find((entry) => entry.expertTemplateId === templateId);
      if (!item || item.status === 'ALREADY_INSTALLED') continue;
      const template = templateById.get(templateId)!;
      await this.operations.updateExpertItem(item.id, {
        status: 'SUBMITTING',
        startedAt: new Date(),
      });
      try {
        const result = await client.installExpertToUser(
          octopUserId,
          templateId,
          {
            name: template.name ?? templateId,
            description: template.description ?? '',
          },
        );
        await this.operations.updateExpertItem(item.id, {
          status: result.alreadyInstalled
            ? 'ALREADY_INSTALLED'
            : result.bootstrapPending
              ? 'BOOTSTRAP_PENDING'
              : 'COMPLETED',
          agentId: result.agentId,
          bootstrapPending: result.bootstrapPending,
          errorCode: null,
          errorMessage: null,
          completedAt: result.bootstrapPending ? null : new Date(),
        });
      } catch (error) {
        if (isExpertAlreadyInstalled(error)) {
          await this.operations.updateExpertItem(item.id, {
            status: 'ALREADY_INSTALLED',
            errorCode: 'OCTOP_EXPERT_ALREADY_INSTALLED',
            errorMessage: messageOf(error),
            completedAt: new Date(),
          });
          continue;
        }
        if (isOutcomeUnknown(error) || isExpertOutcomeUnknown(error)) {
          await this.operations.updateExpertItem(item.id, {
            status: 'OUTCOME_UNKNOWN',
            errorCode: reasonOf(error),
            errorMessage: messageOf(error),
          });
          continue;
        }
        await this.operations.updateExpertItem(item.id, {
          status: 'FAILED',
          errorCode: reasonOf(error),
          errorMessage: messageOf(error),
          completedAt: new Date(),
        });
      }
    }
  }

  private async finalizeOperation(
    operationId: string,
    finish: (
      patch: Parameters<AgentGrantOperationStore['transition']>[1],
    ) => Promise<AgentGrantOperationRecord>,
  ): Promise<AgentGrantOperationRecord> {
    const items = await this.operations.listExpertItems(operationId);
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let pending = false;
    for (const item of items) {
      if (item.status === 'ALREADY_INSTALLED') skipped += 1;
      else if (item.status === 'COMPLETED') completed += 1;
      else if (
        item.status === 'BOOTSTRAP_PENDING' ||
        item.status === 'OUTCOME_UNKNOWN'
      ) {
        pending = true;
        completed += 1;
      } else if (item.status === 'FAILED') failed += 1;
    }
    const status = summarizeParentStatus({
      completed,
      failed,
      skipped,
      pending,
      total: items.length,
    });
    return finish({
      status,
      completedExpertCount: completed,
      failedExpertCount: failed,
      skippedExpertCount: skipped,
      errorCode: failed > 0 ? 'OCTOP_EXPERT_INSTALL_FAILED' : null,
      errorMessage:
        failed > 0
          ? 'One or more expert installs failed. Successful experts were kept.'
          : null,
    });
  }

  private async preflightCreate(
    client: OctopManagementClient,
    input: AgentGrantCreateInput,
    employee: {
      readonly name: string;
      readonly displayName: string;
      readonly email: string;
    },
    defaultExpertId: string,
  ): Promise<Record<string, unknown>> {
    const directory = input.directory !== false;
    if (!directory) {
      if (!input.password || input.password.length < 8) {
        throw portalError(
          'FAILED_PRECONDITION',
          'PASSWORD_TOO_WEAK',
          'A local password of at least 8 characters is required when directory is off.',
        );
      }
    }

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

    // Permissions are inherited from the role. Client-supplied lists are ignored.
    const permissions = [...role.permissions];
    if (directory) {
      const ldap = await client.getLdapConfig();
      if (!ldap.configured) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_DIRECTORY_NOT_CONFIGURED',
          'Octop LDAP is not enabled or has no bind password.',
        );
      }
    }

    return buildOctopUserCreateBody({
      username: employee.name,
      displayName: employee.displayName || null,
      email: employee.email || null,
      directory,
      password: directory ? null : input.password,
      role: role.id,
      roleName: role.name,
      permissions,
      workspaceRootDir:
        input.workspaceRootDir === undefined
          ? role.workspaceRootDir
          : input.workspaceRootDir,
      tokenQuota:
        input.tokenQuota === undefined ? role.tokenQuota : input.tokenQuota,
      maxAgents:
        input.maxAgents === undefined ? role.maxAgents : input.maxAgents,
      allowedBackendTypes: ['docker'],
      createDefaultExpert: true,
      expertTemplateId: defaultExpertId,
    });
  }

  private assertMaxAgents(
    maxAgents: number | null | undefined,
    currentCount: number,
    installCount: number,
  ): void {
    if (maxAgents == null) return;
    if (currentCount + installCount > maxAgents) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_MAX_AGENTS_EXCEEDED',
        'Selected experts would exceed the user max_agents quota.',
      );
    }
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
          operationMode: row.operationMode,
          casdoorUserId: row.casdoorUserId,
          username: row.username,
          octopUserId: row.octopUserId,
          agentId: row.agentId,
          selectedExpertCount: row.selectedExpertCount,
          completedExpertCount: row.completedExpertCount,
          failedExpertCount: row.failedExpertCount,
          skippedExpertCount: row.skippedExpertCount,
          errorCode: row.errorCode,
        },
      });
    } catch {
      if (row.status === 'COMPLETED' || row.status === 'PARTIAL') {
        await this.operations.transition(row.id, {
          errorCode: 'AGENT_GRANT_AUDIT_FAILED',
          errorMessage: 'The operation was stored but the audit record failed.',
        });
      }
    }
  }
}

function uniqueIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function classifyDefaultExpert(
  expert: OctopCreateUserResult['defaultExpert'],
): 'COMPLETED' | 'BOOTSTRAP_PENDING' | 'FAILED' {
  if (!expert?.agentId) return 'FAILED';
  if (expert.bootstrapStatus === 'pending') return 'BOOTSTRAP_PENDING';
  if (expert.errorCode) return 'FAILED';
  return 'COMPLETED';
}

function classifyExpertBootstrap(
  agent: OctopAgent | undefined,
): 'COMPLETED' | 'BOOTSTRAP_PENDING' | 'FAILED' | 'ALREADY_INSTALLED' {
  if (!agent || agent.kind !== 'expert') return 'BOOTSTRAP_PENDING';
  if (agent.bootstrapPending) return 'BOOTSTRAP_PENDING';
  if (agent.lastError) return 'FAILED';
  return 'COMPLETED';
}

function summarizeParentStatus(args: {
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly pending: boolean;
  readonly total: number;
}): AgentGrantOperationRecord['status'] {
  const { completed, failed, skipped, pending, total } = args;
  if (total === 0) return 'FAILED_NO_MUTATION';
  if (failed > 0 && completed + skipped > 0) return 'PARTIAL';
  if (failed > 0) return 'EXPERT_INSTALL_FAILED';
  if (pending) return 'BOOTSTRAP_PENDING';
  return 'COMPLETED';
}

function auditResult(
  status: AgentGrantOperationRecord['status'],
): 'success' | 'denied' | 'unavailable' | 'conflict' {
  if (status === 'COMPLETED' || status === 'PARTIAL') return 'success';
  if (status === 'BLOCKED') return 'denied';
  if (
    status === 'ACCOUNT_EXISTS' ||
    status === 'ACCOUNT_EXISTS_UNATTRIBUTED' ||
    status === 'BOOTSTRAP_FAILED' ||
    status === 'EXPERT_INSTALL_FAILED'
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
    (error.reason === 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN' ||
      error.reason === 'OCTOP_EXPERT_INSTALL_OUTCOME_UNKNOWN')
  );
}

function isExpertOutcomeUnknown(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.reason === 'OCTOP_EXPERT_INSTALL_OUTCOME_UNKNOWN'
  );
}

function isAccountExists(error: unknown): boolean {
  return error instanceof ApiError && error.reason === 'OCTOP_ACCOUNT_EXISTS';
}

function isExpertAlreadyInstalled(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.reason === 'OCTOP_EXPERT_ALREADY_INSTALLED'
  );
}

export function octopGuardOptionsFrom(
  config: EnterpriseAppPortalConfig,
): OctopUrlGuardOptions {
  return {
    allowHttp: config.octopApiAllowHttp === true,
    allowPrivateDns: config.octopApiAllowPrivateDns === true,
  };
}

/** Exposed for tests that assert role inheritance. */
export function rolePermissionsOf(role: OctopRole): readonly string[] {
  return role.permissions;
}
