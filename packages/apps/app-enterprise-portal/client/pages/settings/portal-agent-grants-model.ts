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
}

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

export interface AgentGrantPermission {
  readonly key: string;
  readonly category: string;
  readonly label: string;
}

export interface AgentGrantCreateOptions {
  readonly roles: readonly AgentGrantRole[];
  readonly permissions: readonly AgentGrantPermission[];
  readonly ldapConfigured: boolean;
  readonly backendTypes: readonly string[];
}

export interface AgentGrantOperation {
  readonly id: string;
  readonly status: string;
  readonly bootstrapStatus: string | null;
  readonly agentId: string | null;
  readonly publishedExpertId: string | null;
  readonly octopUserId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export type AgentGrantResultKind =
  | 'USER_CREATED'
  | 'BOOTSTRAP_PENDING'
  | 'COMPLETED'
  | 'BOOTSTRAP_FAILED'
  | 'OUTCOME_UNKNOWN'
  | 'ACCOUNT_EXISTS'
  | 'OTHER';

/**
 * Body for `POST .../grants`. Matches the server strict schema:
 * directory mode, username, and template source are applied on the server.
 */
export interface AgentGrantCreateBody {
  readonly casdoorUserId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly role: string;
  readonly permissions: readonly string[];
  readonly workspaceRootDir: string | null;
  readonly tokenQuota: number | null;
  readonly maxAgents: number | null;
  readonly allowedBackendTypes: readonly string[];
  readonly createDefaultExpert: boolean;
  readonly expertTemplateId?: string;
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
  if (status === 'BOOTSTRAP_PENDING' || operation.bootstrapStatus === 'pending')
    return 'BOOTSTRAP_PENDING';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'USER_CREATED') return 'USER_CREATED';
  return 'OTHER';
}

/** A pending expert keeps the pending label even when Octop state reads completed. */
export function expertStatusText(
  expert: { readonly state: string; readonly bootstrapPending: boolean },
  pendingLabel: string,
): string {
  if (expert.bootstrapPending) return pendingLabel;
  return expert.state;
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

/** Fields that follow the selected role. Permissions are replaced, not merged. */
export function roleDraftFields(
  role: AgentGrantRole | undefined,
  options: Pick<AgentGrantCreateOptions, 'permissions' | 'backendTypes'>,
): {
  readonly roleId: string;
  readonly permissions: readonly string[];
  readonly maxAgents: string;
  readonly tokenQuota: string;
  readonly workspaceRootDir: string;
  readonly allowedBackendTypes: readonly string[];
} {
  const allowed = new Set(options.permissions.map((item) => item.key));
  const backends = new Set(options.backendTypes);
  return {
    roleId: role?.id ?? '',
    permissions: (role?.permissions ?? []).filter((key) => allowed.has(key)),
    maxAgents: numberField(role?.maxAgents ?? null),
    tokenQuota: numberField(role?.tokenQuota ?? null),
    workspaceRootDir: role?.workspaceRootDir ?? '',
    allowedBackendTypes: (role?.allowedBackendTypes ?? []).filter((type) =>
      backends.has(type),
    ),
  };
}

export function buildAgentGrantCreateBody(input: {
  readonly casdoorUserId: string;
  readonly displayName: string;
  readonly email: string;
  readonly roleId: string;
  readonly permissions: readonly string[];
  readonly maxAgents: string;
  readonly tokenQuota: string;
  readonly workspaceRootDir: string;
  readonly allowedBackendTypes: readonly string[];
  readonly createDefaultExpert: boolean;
  readonly expertTemplateId?: string;
}): AgentGrantCreateBody | undefined {
  const maxAgents = parseOptionalNumber(input.maxAgents);
  const tokenQuota = parseOptionalNumber(input.tokenQuota);
  if (maxAgents === undefined || tokenQuota === undefined) return undefined;
  if (!input.roleId) return undefined;
  if (input.createDefaultExpert && !input.expertTemplateId) return undefined;
  const body: AgentGrantCreateBody = {
    casdoorUserId: input.casdoorUserId,
    displayName: blankToNull(input.displayName),
    email: blankToNull(input.email),
    role: input.roleId,
    permissions: [...input.permissions],
    workspaceRootDir: blankToNull(input.workspaceRootDir),
    tokenQuota,
    maxAgents,
    allowedBackendTypes: [...input.allowedBackendTypes],
    createDefaultExpert: input.createDefaultExpert,
  };
  if (!input.createDefaultExpert) return body;
  return { ...body, expertTemplateId: input.expertTemplateId };
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
