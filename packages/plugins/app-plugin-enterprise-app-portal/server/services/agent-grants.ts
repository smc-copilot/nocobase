import { ApiError } from '@nocobase/app-server/router';

import type { OctopApiAuthMode } from '../config.js';
import type { EnterpriseAppPortalConfig } from '../config.js';
import { portalError } from '../errors.js';
import type { AccessAuditLog } from './access-audit.js';
import type { ApplicationCatalogService } from './application-catalog.js';
import type { PortalApplicationRecord } from './application-catalog.js';
import {
  AgentGrantOperationStore,
  isTerminalAgentGrantStatus,
  type AgentGrantExpertItemRecord,
  type AgentGrantOperationRecord,
} from './agent-grant-operations.js';
import { AgentGrantsReadService, matchOctopUser } from './agent-grants-read.js';
import type { CasdoorApplicationGrants } from './casdoor-application-grants.js';
import {
  buildOctopUserCreateBody,
  normalizeOctopIdentityField,
} from './octop-create-request.js';
import { dockerSandboxBackend } from './octop-docker-backend.js';
import {
  assertEnvName,
  assertGrantApplication,
} from './octop-instance-config.js';
import type {
  OctopAgent,
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
  readonly supportsInstallAsUser: boolean;
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

/**
 * These statuses mean Octop already accepted the user. The lock can be closed
 * once that account is gone. SUBMITTING and OUTCOME_UNKNOWN stay locked,
 * because a timed-out create may still have succeeded.
 */
const ACCOUNT_GONE_LOCK_STATUSES = new Set([
  'USER_CREATED',
  'BOOTSTRAP_PENDING',
]);

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
  'OCTOP_AS_USER_NOT_SUPPORTED',
  'OCTOP_ACCOUNT_DISABLED',
  'PASSWORD_CONFIRM_MISMATCH',
  'PASSWORD_TOO_WEAK',
]);

/**
 * Creates one Octop user (when missing) and installs selected published experts
 * via admin token + `as_user`. Never installs without `as_user`. Passwords and
 * tokens are never written into operations or audit.
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
        supportsInstallAsUser: input.supportsInstallAsUser,
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
    const defaultExpertTemplateId = input.defaultExpertTemplateId ?? null;
    if (
      defaultExpertTemplateId &&
      !templateIds.includes(defaultExpertTemplateId)
    ) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_DEFAULT_EXPERT_INVALID',
        'defaultExpertTemplateId must be one of the selected install templates.',
      );
    }

    const operation = await this.acquireOperation({
      app,
      casdoorUserId: input.casdoorUserId,
      username: normalizeOctopIdentityField(employee.name),
      actorUserId,
      selectedExpertCount: templateIds.length,
      expertTemplateId: defaultExpertTemplateId,
      createOptionsSnapshot: {
        role: input.role ?? 'user',
        directory: input.directory !== false,
        expertTemplateSource: 'published',
        expertTemplateIds: templateIds,
        defaultExpertTemplateId,
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

      if (!app.supportsInstallAsUser) {
        throw portalError(
          'FAILED_PRECONDITION',
          'OCTOP_AS_USER_NOT_SUPPORTED',
          'This Octop instance has not enabled install-as-user. Enable supportsInstallAsUser only after verifying as_user ownership.',
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
        if (templateIds.length === 0) {
          throw portalError(
            'FAILED_PRECONDITION',
            'OCTOP_TEMPLATE_NOT_FOUND',
            'At least one published expert template is required for existing users.',
          );
        }
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

  /**
   * Takes the per-employee lock. A leftover lock is closed when Octop no
   * longer has the account, or when a previous bootstrap has already
   * finished. A create that is still talking to Octop keeps the 409.
   */
  private async acquireOperation(draft: {
    readonly app: PortalApplicationRecord;
    readonly casdoorUserId: string;
    readonly username: string;
    readonly actorUserId: string;
    readonly selectedExpertCount: number;
    readonly expertTemplateId: string | null;
    readonly createOptionsSnapshot: unknown;
  }): Promise<AgentGrantOperationRecord> {
    const operationDraft = {
      appCode: draft.app.appCode,
      casdoorUserId: draft.casdoorUserId,
      username: draft.username,
      actorUserId: draft.actorUserId,
      selectedExpertCount: draft.selectedExpertCount,
      expertTemplateId: draft.expertTemplateId,
      createOptionsSnapshot: draft.createOptionsSnapshot,
    };
    try {
      return await this.operations.acquire(operationDraft);
    } catch (error) {
      if (reasonOf(error) !== 'AGENT_GRANT_OPERATION_IN_PROGRESS') throw error;
      const released = await this.releaseLockForDeletedAccount(
        draft.app,
        draft.casdoorUserId,
        draft.username,
      );
      if (released) return await this.operations.acquire(operationDraft);
      const finished = await this.releaseLockAfterBootstrapFinished(
        draft.app,
        draft.casdoorUserId,
        draft.actorUserId,
      );
      if (!finished) throw error;
      return await this.operations.acquire(operationDraft);
    }
  }

  /**
   * Closes a leftover lock after an Octop administrator deletes the account.
   * Returns false when the account is still there, the lock is a live create,
   * or Octop cannot be read.
   */
  private async releaseLockForDeletedAccount(
    app: PortalApplicationRecord,
    casdoorUserId: string,
    username: string,
  ): Promise<boolean> {
    const holding = await this.operations.findByLockKey(
      app.appCode,
      casdoorUserId,
    );
    if (!holding || !lockCanBeReleased(holding)) return false;
    let users: readonly OctopUser[];
    try {
      const client = await this.openClient(app);
      users = await client.getUsers();
    } catch {
      return false;
    }
    if (matchOctopUser(users, username)) return false;
    const createdBefore =
      holding.octopUserId != null ||
      holding.status === 'USER_CREATED' ||
      holding.status === 'BOOTSTRAP_PENDING';
    await this.operations.transition(holding.id, {
      status: createdBefore ? 'BOOTSTRAP_FAILED' : 'SAFE_TO_RETRY',
      errorCode: 'OCTOP_ACCOUNT_REMOVED',
      errorMessage:
        'The Octop account no longer exists. The previous operation was closed so the employee can be initialized again.',
    });
    return true;
  }

  /**
   * Polls Octop for a leftover BOOTSTRAP_PENDING lock from before the lock
   * was released at finalize. USER_CREATED / SUBMITTING stay locked: those
   * rows may still be writing to Octop.
   */
  private async releaseLockAfterBootstrapFinished(
    app: PortalApplicationRecord,
    casdoorUserId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const holding = await this.operations.findByLockKey(
      app.appCode,
      casdoorUserId,
    );
    if (!holding || holding.status !== 'BOOTSTRAP_PENDING') return false;
    const reconciled = await this.reconcile(holding.id, actorUserId);
    return (
      isTerminalAgentGrantStatus(reconciled.status) ||
      reconciled.lockKey == null
    );
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
      const agent = findExpertAgent(
        agents,
        item,
        operation.octopUserId,
        operation.username,
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
    // Octop create always uses create_default_expert=false; selected templates
    // are installed afterwards. defaultExpertTemplateId is optional metadata.
    const defaultExpertId = input.defaultExpertTemplateId ?? null;

    const body = await this.preflightCreate(client, input, employee);
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
      agentId: null,
      bootstrapStatus: null,
      expertTemplateId: defaultExpertId,
    });

    if (templateIds.length > 0) {
      await this.installTemplatesSequentially({
        operationId: operation.id,
        client,
        octopUserId: created.id,
        templateIds,
        templateById,
      });
    }

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
        const name = template.name ?? templateId;
        const result = await client.installPublishedExpertForUser(
          octopUserId,
          templateId,
          {
            name,
            description: template.description ?? '',
            // Published experts may default to local_shell. Point the install
            // at the preconfigured Docker sandbox resource.
            backend: dockerSandboxBackend(),
          },
        );
        assertInstallOwner(result.userId, octopUserId);
        const verified = await this.verifyInstalledAgent(
          client,
          octopUserId,
          templateId,
          result.agentId,
        );
        await this.operations.updateExpertItem(item.id, {
          status: result.alreadyInstalled
            ? 'ALREADY_INSTALLED'
            : verified.bootstrapPending || result.bootstrapPending
              ? 'BOOTSTRAP_PENDING'
              : 'COMPLETED',
          agentId: verified.agentId ?? result.agentId,
          bootstrapPending:
            verified.bootstrapPending || result.bootstrapPending,
          errorCode: null,
          errorMessage: null,
          completedAt:
            verified.bootstrapPending || result.bootstrapPending
              ? null
              : new Date(),
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
          const reconciled = await this.reconcileExpertInstall(
            client,
            octopUserId,
            templateId,
          );
          if (reconciled) {
            await this.operations.updateExpertItem(item.id, {
              status: reconciled.bootstrapPending
                ? 'BOOTSTRAP_PENDING'
                : 'COMPLETED',
              agentId: reconciled.agentId,
              bootstrapPending: reconciled.bootstrapPending,
              errorCode: null,
              errorMessage: null,
              completedAt: reconciled.bootstrapPending ? null : new Date(),
            });
            continue;
          }
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

  private async verifyInstalledAgent(
    client: OctopManagementClient,
    octopUserId: string,
    templateId: string,
    agentId: string,
  ): Promise<{
    readonly agentId: string | null;
    readonly bootstrapPending: boolean;
  }> {
    const agents = await client.getAgents('all');
    const match =
      agents.find(
        (agent) =>
          agent.agentId === agentId &&
          agent.kind === 'expert' &&
          sameOctopUserId(agent.userId, octopUserId),
      ) ??
      agents.find(
        (agent) =>
          agent.kind === 'expert' &&
          agent.publishedExpertId === templateId &&
          sameOctopUserId(agent.userId, octopUserId),
      );
    if (!match) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_AGENT_OWNER_MISMATCH',
        'Octop Agent Owner does not match the target employee after install.',
      );
    }
    if (match.publishedExpertId && match.publishedExpertId !== templateId) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_AGENT_OWNER_MISMATCH',
        'Octop Agent published_expert_id does not match the installed template.',
      );
    }
    return {
      agentId: match.agentId,
      bootstrapPending: match.bootstrapPending,
    };
  }

  private async reconcileExpertInstall(
    client: OctopManagementClient,
    octopUserId: string,
    templateId: string,
  ): Promise<{
    readonly agentId: string;
    readonly bootstrapPending: boolean;
  } | null> {
    try {
      const agents = await client.getAgents('all');
      const match = agents.find(
        (agent) =>
          agent.kind === 'expert' &&
          agent.publishedExpertId === templateId &&
          sameOctopUserId(agent.userId, octopUserId),
      );
      if (!match?.agentId) return null;
      return {
        agentId: match.agentId,
        bootstrapPending: match.bootstrapPending,
      };
    } catch {
      return null;
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
      createDefaultExpert: false,
      expertTemplateId: null,
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

function lockCanBeReleased(operation: AgentGrantOperationRecord): boolean {
  return ACCOUNT_GONE_LOCK_STATUSES.has(operation.status);
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

function sameOctopUserId(
  left: string | null | undefined,
  right: string | number,
): boolean {
  if (left == null || left === '') return false;
  return Number(left) === Number(right);
}

function findExpertAgent(
  agents: readonly OctopAgent[],
  item: AgentGrantExpertItemRecord,
  octopUserId: string | null,
  username: string | null,
): OctopAgent | undefined {
  if (item.agentId) {
    const byId = agents.find((entry) => entry.agentId === item.agentId);
    if (byId) return byId;
  }
  return agents.find((entry) => {
    if (entry.kind !== 'expert') return false;
    if (entry.publishedExpertId !== item.expertTemplateId) return false;
    if (!octopUserId && !username) return true;
    if (octopUserId && sameOctopUserId(entry.userId, octopUserId)) return true;
    if (!username || !entry.ownerUsername) return false;
    return entry.ownerUsername.toLowerCase() === username.toLowerCase();
  });
}

function assertInstallOwner(
  resultUserId: string | null,
  targetUserId: string,
): void {
  if (resultUserId == null || resultUserId === '') return;
  if (!sameOctopUserId(resultUserId, targetUserId)) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_AGENT_OWNER_MISMATCH',
      'Octop Agent Owner does not match the target employee.',
    );
  }
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
  // Zero experts is valid for create-user-only; treat as success.
  if (total === 0) return 'COMPLETED';
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
