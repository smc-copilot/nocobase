export interface AgentGrantApplication {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly casdoorAppKey: string;
  readonly agentGrantsEnabled: boolean;
  readonly apiBaseUrlConfigured: boolean;
  readonly apiAuthMode: string | null;
}

export interface AgentGrantEmployee {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  readonly isForbidden: boolean;
  readonly grantSource?: 'direct' | 'inherited';
  /** Octop account presence from the employees list enrichment. */
  readonly accountExists: boolean;
  readonly octopUserId: string | null;
  readonly disabled: boolean;
  /** Octop account create time (ISO-8601), null when unsynced. */
  readonly syncedAt: string | null;
  readonly experts: readonly InstalledExpert[];
}

export type EmployeeSyncFilter = 'all' | 'unsynced' | 'synced';

export interface InstalledExpert {
  readonly agentId: string;
  readonly publishedExpertId: string | null;
  readonly name: string;
  readonly state: string;
  readonly bootstrapPending: boolean;
}

export interface OctopAccountState {
  readonly accountExists: boolean;
  readonly disabled: boolean;
  readonly octopUserId: string | null;
  readonly experts: readonly InstalledExpert[];
}

export interface PublishedTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly creatorUsername: string | null;
  readonly updatedAt: string | null;
}

export interface AgentGrantRole {
  readonly id: string;
  readonly name: string;
  readonly systemRole: string | null;
  readonly permissions: readonly string[];
  readonly maxAgents: number | null;
  readonly tokenQuota: number | null;
  readonly workspaceRootDir: string | null;
  readonly allowedBackendTypes: readonly string[];
}

export interface AgentGrantCreateOptions {
  readonly roles: readonly AgentGrantRole[];
  readonly ldapConfigured: boolean;
  readonly allowedBackendTypes: readonly ['docker'];
  readonly expertTemplateSource: 'published';
}

export interface AgentGrantOperation {
  readonly id: string;
  readonly status: string;
  readonly operationMode: string | null;
  readonly selectedExpertCount: number;
  readonly completedExpertCount: number;
  readonly failedExpertCount: number;
  readonly skippedExpertCount: number;
  readonly bootstrapStatus: string | null;
  readonly agentId: string | null;
  readonly publishedExpertId: string | null;
  readonly octopUserId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface CreateDraft {
  readonly roleId: string;
  readonly directory: boolean;
  readonly password: string;
  readonly confirmPassword: string;
  readonly workspaceEnabled: boolean;
  readonly workspaceRootDir: string;
  readonly tokenQuotaEnabled: boolean;
  readonly tokenQuota: string;
  readonly maxAgentsEnabled: boolean;
  readonly maxAgents: string;
  readonly expertTemplateIds: readonly string[];
  readonly defaultExpertTemplateId: string | null;
}

export type AgentGrantResultKind =
  | 'USER_CREATED'
  | 'BOOTSTRAP_PENDING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'BOOTSTRAP_FAILED'
  | 'OUTCOME_UNKNOWN'
  | 'ACCOUNT_EXISTS'
  | 'OTHER';

export type AccountSyncStatus =
  | 'NOT_CREATED'
  | 'SYNCED_DIRECTORY'
  | 'CREATED_LOCAL'
  | 'DISABLED'
  | 'LOOKUP_FAILED';

/**
 * Body for `POST .../grants`. Identity fields are resolved on the server.
 * Confirm password is never sent. Permissions inherit from the role server-side.
 */
export interface AgentGrantCreateBody {
  readonly casdoorUserId: string;
  readonly role: string;
  readonly workspaceRootDir: string | null;
  readonly tokenQuota: number | null;
  readonly maxAgents: number | null;
  readonly directory: boolean;
  readonly password?: string;
  readonly expertTemplateIds: readonly string[];
  readonly defaultExpertTemplateId: string | null;
}

/** Username / email sent to Octop: trim + lowercase. */
export function normalizeOctopIdentityField(
  value: string | null | undefined,
): string {
  return (value ?? '').trim().toLowerCase();
}

/** Octop apps with Agent Grants enabled. WeKnora and every other app type stay out. */
export function selectAgentGrantApplications<
  T extends { readonly appType: string; readonly agentGrantsEnabled: boolean },
>(applications: readonly T[]): T[] {
  return applications.filter(
    (application) =>
      application.appType.trim().toLowerCase() === 'octop' &&
      application.agentGrantsEnabled,
  );
}

/**
 * Pending bootstrap is never presented as completed, including when a stale
 * status still says COMPLETED while bootstrapStatus is pending.
 */
export function agentGrantResultKind(operation: {
  readonly status?: string | null;
  readonly bootstrapStatus?: string | null;
}): AgentGrantResultKind {
  const status = operation.status ?? '';
  if (status === 'BOOTSTRAP_FAILED') return 'BOOTSTRAP_FAILED';
  if (status === 'OUTCOME_UNKNOWN') return 'OUTCOME_UNKNOWN';
  if (status === 'ACCOUNT_EXISTS' || status === 'ACCOUNT_EXISTS_UNATTRIBUTED') {
    return 'ACCOUNT_EXISTS';
  }
  if (status === 'PARTIAL' || status === 'EXPERT_INSTALL_FAILED') {
    return 'PARTIAL';
  }
  if (status === 'BOOTSTRAP_PENDING' || operation.bootstrapStatus === 'pending')
    return 'BOOTSTRAP_PENDING';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'USER_CREATED') return 'USER_CREATED';
  return 'OTHER';
}

/**
 * Pending bootstrap keeps a dedicated label. The agent id is already persisted
 * on Octop; pending only means workspace/bootstrap has not finished.
 */
export function expertStatusText(
  expert: { readonly state: string; readonly bootstrapPending: boolean },
  pendingLabel: string,
): string {
  if (expert.bootstrapPending) return pendingLabel;
  return expert.state || '—';
}

export function selectableRoles<
  T extends { readonly id: string; readonly systemRole?: string | null },
>(roles: readonly T[]): T[] {
  return roles.filter(
    (role) => role.systemRole !== 'admin' && role.id !== 'admin',
  );
}

export function defaultRoleId(
  roles: readonly { readonly id: string }[],
): string {
  return roles.find((role) => role.id === 'user')?.id ?? roles[0]?.id ?? '';
}

export function filterPublishedTemplates<
  T extends {
    readonly id: string;
    readonly name: string;
    readonly description?: string | null;
    readonly creatorUsername?: string | null;
  },
>(templates: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...templates];
  return templates.filter((template) =>
    [
      template.id,
      template.name,
      template.description ?? '',
      template.creatorUsername ?? '',
    ].some((value) => value.toLowerCase().includes(needle)),
  );
}

export function installedTemplateIds(
  experts: readonly InstalledExpert[],
): ReadonlySet<string> {
  return new Set(
    experts
      .map((expert) => expert.publishedExpertId)
      .filter((id): id is string => Boolean(id)),
  );
}

export function accountSyncStatus(state: {
  readonly lookupFailed?: boolean;
  readonly accountExists: boolean;
  readonly disabled: boolean;
  readonly directory?: boolean;
}): AccountSyncStatus {
  if (state.lookupFailed) return 'LOOKUP_FAILED';
  if (!state.accountExists) return 'NOT_CREATED';
  if (state.disabled) return 'DISABLED';
  if (state.directory === false) return 'CREATED_LOCAL';
  return 'SYNCED_DIRECTORY';
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Blank is null. A non-integer is invalid (`undefined`), not zero. */
export function parseOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/u.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Visible policy fields that follow the selected role. Backend stays docker. */
export function roleDraftFields(role: AgentGrantRole | undefined): {
  readonly roleId: string;
  readonly maxAgents: string;
  readonly tokenQuota: string;
  readonly workspaceRootDir: string;
  readonly maxAgentsEnabled: boolean;
  readonly tokenQuotaEnabled: boolean;
  readonly workspaceEnabled: boolean;
} {
  return {
    roleId: role?.id ?? '',
    maxAgents: numberField(role?.maxAgents ?? null),
    tokenQuota: numberField(role?.tokenQuota ?? null),
    workspaceRootDir: role?.workspaceRootDir ?? '',
    maxAgentsEnabled: role?.maxAgents != null,
    tokenQuotaEnabled: role?.tokenQuota != null,
    workspaceEnabled: Boolean(role?.workspaceRootDir),
  };
}

export function emptyCreateDraft(roleId = ''): CreateDraft {
  return {
    roleId,
    directory: true,
    password: '',
    confirmPassword: '',
    workspaceEnabled: false,
    workspaceRootDir: '',
    tokenQuotaEnabled: false,
    tokenQuota: '',
    maxAgentsEnabled: false,
    maxAgents: '',
    expertTemplateIds: [],
    defaultExpertTemplateId: null,
  };
}

export function withRoleDefaults(
  draft: CreateDraft,
  role: AgentGrantRole | undefined,
): CreateDraft {
  const fields = roleDraftFields(role);
  return {
    ...draft,
    roleId: fields.roleId,
    workspaceEnabled: fields.workspaceEnabled,
    workspaceRootDir: fields.workspaceRootDir,
    tokenQuotaEnabled: fields.tokenQuotaEnabled,
    tokenQuota: fields.tokenQuota,
    maxAgentsEnabled: fields.maxAgentsEnabled,
    maxAgents: fields.maxAgents,
  };
}

export function toggleExpertTemplate(
  draft: CreateDraft,
  templateId: string,
  checked: boolean,
  isNewUser: boolean,
): CreateDraft {
  const selected = new Set(draft.expertTemplateIds);
  if (checked) selected.add(templateId);
  else selected.delete(templateId);
  const expertTemplateIds = [...selected];
  let defaultExpertTemplateId = draft.defaultExpertTemplateId;
  if (!isNewUser) {
    defaultExpertTemplateId = null;
  } else if (
    defaultExpertTemplateId &&
    !selected.has(defaultExpertTemplateId)
  ) {
    defaultExpertTemplateId = null;
  }
  if (isNewUser && expertTemplateIds.length === 1) {
    defaultExpertTemplateId = expertTemplateIds[0] ?? null;
  }
  return { ...draft, expertTemplateIds, defaultExpertTemplateId };
}

export function buildAgentGrantCreateBody(input: {
  readonly casdoorUserId: string;
  readonly isNewUser: boolean;
  readonly draft: CreateDraft;
}): AgentGrantCreateBody | undefined {
  const { draft, isNewUser } = input;
  if (!draft.roleId) return undefined;
  if (draft.expertTemplateIds.length === 0) return undefined;
  if (!draft.directory) {
    if (!draft.password || draft.password.length < 8) return undefined;
    if (draft.password !== draft.confirmPassword) return undefined;
  }
  if (isNewUser) {
    if (
      !draft.defaultExpertTemplateId ||
      !draft.expertTemplateIds.includes(draft.defaultExpertTemplateId)
    ) {
      return undefined;
    }
  } else if (draft.defaultExpertTemplateId) {
    return undefined;
  }

  const maxAgents = draft.maxAgentsEnabled
    ? parseOptionalNumber(draft.maxAgents)
    : null;
  const tokenQuota = draft.tokenQuotaEnabled
    ? parseOptionalNumber(draft.tokenQuota)
    : null;
  if (maxAgents === undefined || tokenQuota === undefined) return undefined;
  // New users: selection must fit the quota written on create.
  // Existing users: quota lives on the Octop account; do not send role defaults.
  if (
    isNewUser &&
    maxAgents != null &&
    draft.expertTemplateIds.length > maxAgents
  ) {
    return undefined;
  }

  const body: AgentGrantCreateBody = {
    casdoorUserId: input.casdoorUserId,
    role: draft.roleId,
    workspaceRootDir: draft.workspaceEnabled
      ? blankToNull(draft.workspaceRootDir)
      : null,
    tokenQuota: isNewUser ? tokenQuota : null,
    maxAgents: isNewUser ? maxAgents : null,
    directory: draft.directory,
    expertTemplateIds: [...draft.expertTemplateIds],
    defaultExpertTemplateId: isNewUser ? draft.defaultExpertTemplateId : null,
  };
  if (!draft.directory) {
    return { ...body, password: draft.password };
  }
  return body;
}

const AGENT_GRANTS_ROOT = 'enterpriseAppPortal/agentGrants';

export function agentGrantApplicationsPath(): string {
  return `${AGENT_GRANTS_ROOT}/applications`;
}

export function agentGrantApplicationPath(
  appCode: string,
  suffix: string,
): string {
  return `${AGENT_GRANTS_ROOT}/applications/${encodeURIComponent(appCode)}/${suffix}`;
}

/** Casdoor user id is `{owner}/{name}` and the state route splits those segments. */
export function agentGrantOctopStatePath(
  appCode: string,
  casdoorUserId: string,
): string {
  const slash = casdoorUserId.indexOf('/');
  const owner = slash >= 0 ? casdoorUserId.slice(0, slash) : 'unknown';
  const name = slash >= 0 ? casdoorUserId.slice(slash + 1) : casdoorUserId;
  return `${agentGrantApplicationPath(appCode, 'employees')}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/octopState`;
}

export function agentGrantOperationPath(operationId: string): string {
  return `${AGENT_GRANTS_ROOT}/operations/${encodeURIComponent(operationId)}`;
}

export function agentGrantReconcilePath(operationId: string): string {
  return `${agentGrantOperationPath(operationId)}/reconcile`;
}

function numberField(value: number | null): string {
  return value === null ? '' : String(value);
}
