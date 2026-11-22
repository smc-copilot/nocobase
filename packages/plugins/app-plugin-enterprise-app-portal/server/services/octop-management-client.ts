import { portalError } from '../errors.js';

export const DEFAULT_OCTOP_API_TIMEOUT_MS = 15_000;

export type OctopClientAuth =
  | { readonly mode: 'bearer'; readonly token: string }
  | {
      readonly mode: 'password';
      readonly username: string;
      readonly password: string;
    };

export interface OctopHealth {
  readonly ok: boolean;
  readonly db: boolean;
  readonly usersLoaded: number | null;
  readonly agentsRunning: number | null;
}

export interface OctopUser {
  readonly id: string;
  readonly username: string;
  readonly disabled: boolean;
  readonly directory: boolean;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly role: string | null;
  /** Account resource policy; null means unlimited. */
  readonly maxAgents: number | null;
  /** ISO-8601 create time from Octop `created_at` (unix seconds). */
  readonly createdAt: string | null;
}

export interface OctopAgent {
  readonly agentId: string;
  readonly userId: string | null;
  readonly ownerUsername: string | null;
  readonly name: string | null;
  readonly publishedExpertId: string | null;
  readonly kind: string | null;
  readonly state: string | null;
  readonly bootstrapPending: boolean;
  readonly lastError: string | null;
}

export interface OctopRole {
  readonly id: string;
  readonly name: string;
  readonly systemRole: string | null;
  readonly permissions: readonly string[];
  readonly maxAgents: number | null;
  readonly tokenQuota: number | null;
  readonly workspaceRootDir: string | null;
  readonly allowedBackendTypes: readonly string[];
}

export interface OctopPermission {
  readonly key: string;
  readonly category: string | null;
  readonly label: string | null;
}

export interface OctopPublishedExpert {
  readonly id: string;
  readonly slug: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly creatorUsername: string | null;
  readonly iconUrl: string | null;
  readonly updatedAt: string | null;
}

export interface OctopLdapConfig {
  readonly enabled: boolean;
  readonly hasBindPassword: boolean;
  /** Directory mode is usable only when both flags are true. */
  readonly configured: boolean;
}

export interface OctopDefaultExpert {
  readonly requested: boolean;
  readonly source: string | null;
  readonly templateId: string | null;
  readonly status: string | null;
  readonly agentId: string | null;
  readonly bootstrapStatus: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface OctopCreateUserResult {
  readonly id: string;
  readonly username: string;
  readonly defaultExpert: OctopDefaultExpert | null;
}

export interface OctopExpertInstallBody {
  readonly name: string;
  readonly description: string;
}

export interface OctopExpertInstallResult {
  readonly agentId: string;
  readonly name: string;
  readonly state: string;
  readonly publishedExpertId: string;
  readonly bootstrapPending: boolean;
  readonly alreadyInstalled: boolean;
}

interface RequestHints {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly json?: unknown;
  readonly mutation?: boolean;
  readonly failureReason: string;
  /** When true, a 404 resolves as null instead of throwing. */
  readonly allowNotFound?: boolean;
  /** Extra success statuses beyond the default 2xx range. */
  readonly acceptStatuses?: readonly number[];
}

/**
 * Server-side Octop management client.
 * Authorization headers and passwords are never written into errors.
 * Redirects are not followed, including same-host redirects.
 * TLS certificate verification stays at the runtime default.
 */
export class OctopManagementClient {
  private accessToken: string | undefined;

  public constructor(
    private readonly baseUrl: string,
    private readonly auth: OctopClientAuth,
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number = DEFAULT_OCTOP_API_TIMEOUT_MS,
  ) {}

  public async getHealth(): Promise<OctopHealth> {
    const body = await this.request({
      method: 'GET',
      path: '/api/health',
      failureReason: 'OCTOP_INSTANCE_UNAVAILABLE',
    });
    const record = asRecord(body) ?? {};
    return {
      ok: record.ok !== false && record.status !== 'error',
      db: record.db !== false,
      usersLoaded: readNumber(record.users_loaded),
      agentsRunning: readNumber(record.agents_running),
    };
  }

  public async getUsers(): Promise<readonly OctopUser[]> {
    const body = await this.request({
      method: 'GET',
      path: '/api/users',
      failureReason: 'OCTOP_USER_LOOKUP_FAILED',
    });
    return readList(body, ['users', 'data', 'items'])
      .map(parseUser)
      .filter((user): user is OctopUser => user !== undefined);
  }

  public async getAgents(scope = 'all'): Promise<readonly OctopAgent[]> {
    const body = await this.request({
      method: 'GET',
      path: '/api/agents',
      query: { scope },
      failureReason: 'OCTOP_AGENT_LOOKUP_FAILED',
    });
    return readList(body, ['agents', 'data', 'items'])
      .map(parseAgent)
      .filter((agent): agent is OctopAgent => agent !== undefined);
  }

  public async getAgent(agentId: string): Promise<OctopAgent | null> {
    const body = await this.request({
      method: 'GET',
      path: `/api/agents/${encodeURIComponent(agentId)}`,
      failureReason: 'OCTOP_AGENT_LOOKUP_FAILED',
      allowNotFound: true,
    });
    if (body == null) return null;
    return parseAgent(body) ?? null;
  }

  public async getRoles(): Promise<readonly OctopRole[]> {
    const body = await this.request({
      method: 'GET',
      path: '/api/users/roles',
      failureReason: 'OCTOP_ROLE_CATALOG_FAILED',
    });
    return readList(body, ['roles', 'data', 'items'])
      .map(parseRole)
      .filter((role): role is OctopRole => role !== undefined);
  }

  public async getPermissions(): Promise<readonly OctopPermission[]> {
    const body = await this.request({
      method: 'GET',
      path: '/api/users/permissions',
      failureReason: 'OCTOP_PERMISSION_CATALOG_FAILED',
    });
    return readList(body, ['permissions', 'data', 'items'])
      .map(parsePermission)
      .filter((entry): entry is OctopPermission => entry !== undefined);
  }

  public async getPublishedExperts(): Promise<readonly OctopPublishedExpert[]> {
    const body = await this.request({
      method: 'GET',
      path: '/api/experts/published',
      failureReason: 'OCTOP_TEMPLATE_LIST_FAILED',
    });
    return readList(body, ['experts', 'data', 'items'])
      .map(parseExpert)
      .filter((entry): entry is OctopPublishedExpert => entry !== undefined);
  }

  public async getLdapConfig(): Promise<OctopLdapConfig> {
    const body = await this.request({
      method: 'GET',
      path: '/api/auth/ldap/config',
      failureReason: 'OCTOP_DIRECTORY_NOT_CONFIGURED',
    });
    const record = asRecord(body) ?? {};
    const enabled = record.enabled === true;
    const hasBindPassword = record.has_bind_password === true;
    return {
      enabled,
      hasBindPassword,
      configured: enabled && hasBindPassword,
    };
  }

  public async createUser(
    body: Readonly<Record<string, unknown>>,
  ): Promise<OctopCreateUserResult> {
    const payload = await this.request({
      method: 'POST',
      path: '/api/users',
      json: body,
      mutation: true,
      failureReason: 'OCTOP_USER_CREATE_REJECTED',
    });
    const record = asRecord(payload);
    if (!record) {
      throw octopError(
        'UNAVAILABLE',
        'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
        'Octop accepted the create request but returned no user record.',
      );
    }
    const id = readId(record.id);
    const username = readString(record.username) ?? '';
    if (!id) {
      throw octopError(
        'UNAVAILABLE',
        'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
        'Octop accepted the create request but returned no user id.',
      );
    }
    return {
      id,
      username,
      defaultExpert: parseDefaultExpert(record.default_expert),
    };
  }

  /**
   * Creates an expert for a target user from a published template.
   * Matches Octop Expert Market "Create" semantics for an admin actor.
   */
  public async installExpertToUser(
    userId: string,
    expertId: string,
    body: OctopExpertInstallBody,
  ): Promise<OctopExpertInstallResult> {
    const payload = await this.request({
      method: 'POST',
      path: `/api/users/${encodeURIComponent(userId)}/experts/published/${encodeURIComponent(expertId)}/install`,
      json: {
        name: body.name,
        description: body.description,
      },
      mutation: true,
      failureReason: 'OCTOP_EXPERT_INSTALL_REJECTED',
      acceptStatuses: [200, 201],
    });
    const record = asRecord(payload);
    if (!record) {
      throw octopError(
        'UNAVAILABLE',
        'OCTOP_EXPERT_INSTALL_OUTCOME_UNKNOWN',
        'Octop accepted the expert create request but returned no agent record.',
      );
    }
    const agentId = readString(record.agent_id) ?? '';
    const publishedExpertId =
      readString(record.published_expert_id) ?? expertId;
    if (!agentId) {
      throw octopError(
        'UNAVAILABLE',
        'OCTOP_EXPERT_INSTALL_OUTCOME_UNKNOWN',
        'Octop accepted the expert create request but returned no agent id.',
      );
    }
    return {
      agentId,
      name: readString(record.name) ?? body.name,
      state: readString(record.state) ?? 'unknown',
      publishedExpertId,
      bootstrapPending: record.bootstrap_pending === true,
      alreadyInstalled:
        record.already_installed === true || payloadWasAlreadyInstalled(record),
    };
  }

  public async login(username: string, password: string): Promise<string> {
    const payload = await this.request({
      method: 'POST',
      path: '/api/auth/login',
      json: { username, password },
      failureReason: 'OCTOP_AUTH_FAILED',
    });
    const token = readToken(payload);
    if (!token) {
      throw octopError(
        'FAILED_PRECONDITION',
        'OCTOP_AUTH_FAILED',
        'Octop login did not return an access token.',
      );
    }
    this.accessToken = token;
    return token;
  }

  private async request(hints: RequestHints): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (hints.path !== '/api/auth/login') {
      headers.authorization = `Bearer ${await this.bearerToken()}`;
    }
    if (hints.json !== undefined) headers['content-type'] = 'application/json';
    const url = this.resolve(hints.path, hints.query);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: hints.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        ...(hints.json !== undefined
          ? { body: JSON.stringify(hints.json) }
          : {}),
      });
    } catch (error) {
      throw this.transportError(hints, error);
    }
    if (response.status >= 300 && response.status < 400) {
      throw octopError(
        'PERMISSION_DENIED',
        'OCTOP_API_URL_NOT_ALLOWED',
        'Octop redirected the request. Redirects are not followed.',
      );
    }
    if (hints.allowNotFound && response.status === 404) return null;
    const payload = await this.readBody(response);
    if (response.status >= 200 && response.status < 300) return payload;
    if (hints.acceptStatuses?.includes(response.status)) return payload;
    throw this.httpError(hints, response.status, payload);
  }

  private resolve(
    path: string,
    query: Readonly<Record<string, string | undefined>> | undefined,
  ): URL {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL(path.replace(/^\//u, ''), base);
    const expected = new URL(base);
    if (url.host !== expected.host) {
      throw octopError(
        'PERMISSION_DENIED',
        'OCTOP_API_URL_NOT_ALLOWED',
        'The Octop request URL left the configured host.',
      );
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
    return url;
  }

  private async bearerToken(): Promise<string> {
    if (this.auth.mode === 'bearer') return this.auth.token;
    if (this.accessToken) return this.accessToken;
    return this.login(this.auth.username, this.auth.password);
  }

  private transportError(hints: RequestHints, error: unknown): Error {
    if (isTimeout(error)) {
      return octopError(
        'UNAVAILABLE',
        hints.mutation
          ? 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN'
          : 'OCTOP_API_TIMEOUT',
        hints.mutation
          ? 'The Octop create request timed out. The outcome is unknown and was not retried.'
          : 'The Octop API request timed out.',
      );
    }
    if (hints.mutation) {
      return octopError(
        'UNAVAILABLE',
        'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
        'The Octop create request failed before a response. The outcome is unknown and was not retried.',
      );
    }
    return octopError(
      'UNAVAILABLE',
      hints.failureReason,
      'The Octop API request failed.',
    );
  }

  private httpError(
    hints: RequestHints,
    status: number,
    payload: unknown,
  ): Error {
    const code = readOctopCode(payload);
    if (hints.mutation && (status === 408 || status === 504)) {
      return octopError(
        'UNAVAILABLE',
        'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
        'The Octop create request timed out. The outcome is unknown and was not retried.',
      );
    }
    if (status === 408 || status === 504) {
      return octopError(
        'UNAVAILABLE',
        'OCTOP_API_TIMEOUT',
        'The Octop API request timed out.',
      );
    }
    if (hints.mutation && status === 409 && code === 'USERNAME_TAKEN') {
      return octopError(
        'ALREADY_EXISTS',
        'OCTOP_ACCOUNT_EXISTS',
        'Octop reported that the username is already taken.',
        { httpStatus: status, octopCode: code },
      );
    }
    if (
      hints.mutation &&
      (code === 'OCTOP_EXPERT_ALREADY_INSTALLED' ||
        code === 'EXPERT_ALREADY_INSTALLED')
    ) {
      return octopError(
        'ALREADY_EXISTS',
        'OCTOP_EXPERT_ALREADY_INSTALLED',
        'This published expert is already installed for the target user.',
        { httpStatus: status, octopCode: code },
      );
    }
    if (hints.mutation && status === 422) {
      const details = readValidationDetails(payload);
      return octopError(
        'FAILED_PRECONDITION',
        'OCTOP_CREATE_SCHEMA_DRIFT',
        'Octop rejected the create body. The frozen field allowlist does not match this instance.',
        {
          httpStatus: status,
          ...(details ? { details } : {}),
        },
      );
    }
    if (hints.mutation && status >= 500) {
      return octopError(
        'UNAVAILABLE',
        'OCTOP_USER_CREATE_OUTCOME_UNKNOWN',
        'The Octop create request failed without a confirmed result. It was not retried.',
        { httpStatus: status },
      );
    }
    if (status === 401) {
      return octopError(
        'FAILED_PRECONDITION',
        'OCTOP_AUTH_FAILED',
        'Octop rejected the management credential.',
        { httpStatus: status },
      );
    }
    if (status === 403) {
      return octopError(
        'PERMISSION_DENIED',
        'OCTOP_PERMISSION_INSUFFICIENT',
        'The Octop management credential cannot perform this read or write.',
        { httpStatus: status },
      );
    }
    if (hints.mutation) {
      return octopError(
        'FAILED_PRECONDITION',
        hints.failureReason,
        hints.path.includes('/experts/')
          ? 'Octop rejected the expert create request without an unknown outcome.'
          : 'Octop rejected the user create request without an unknown outcome.',
        { httpStatus: status, ...(code ? { octopCode: code } : {}) },
      );
    }
    return octopError(
      status >= 500 ? 'UNAVAILABLE' : 'FAILED_PRECONDITION',
      hints.failureReason,
      'The Octop API request failed.',
      { httpStatus: status },
    );
  }

  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
}

function octopError(
  status:
    | 'INVALID_ARGUMENT'
    | 'FAILED_PRECONDITION'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'ALREADY_EXISTS'
    | 'UNAVAILABLE',
  reason: string,
  message: string,
  metadata?: Record<string, unknown>,
): Error {
  return portalError(status, reason, message, metadata);
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function readId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return readString(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readList(
  payload: unknown,
  keys: readonly string[],
): readonly unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item !== '',
  );
}

function parseUser(value: unknown): OctopUser | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = readId(record.id);
  const username = readString(record.username);
  if (!id || !username) return undefined;
  const policies = asRecord(record.policies) ?? {};
  return {
    id,
    username,
    disabled: record.disabled === true,
    directory: record.directory === true,
    displayName: readString(record.display_name),
    email: readString(record.email),
    role: readString(record.role),
    maxAgents: readNumber(policies.max_agents ?? record.max_agents),
    createdAt: readUnixTimestamp(record.created_at),
  };
}

/** Octop returns unix seconds; accept ms or ISO strings as well. */
function readUnixTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return readUnixTimestamp(asNumber);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseAgent(value: unknown): OctopAgent | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const agentId = readString(record.agent_id) ?? readId(record.id);
  if (!agentId) return undefined;
  const lastError = record.last_error;
  return {
    agentId,
    userId: readId(record.user_id),
    ownerUsername: readString(record.owner_username),
    name: readString(record.name),
    publishedExpertId: readString(record.published_expert_id),
    kind: readString(record.kind),
    state: readString(record.state),
    bootstrapPending: record.bootstrap_pending === true,
    lastError:
      lastError == null
        ? null
        : typeof lastError === 'string'
          ? lastError
          : JSON.stringify(lastError),
  };
}

function parseRole(value: unknown): OctopRole | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id =
    readString(record.user_role_id) ??
    readString(record.id) ??
    readString(record.role);
  if (!id) return undefined;
  const policies = asRecord(record.policies) ?? {};
  const maxAgents = readNumber(policies.max_agents ?? record.max_agents);
  const tokenQuota = readNumber(policies.token_quota ?? record.token_quota);
  const workspaceRootDir =
    readString(policies.workspace_root_dir) ??
    readString(record.workspace_root_dir);
  const backends =
    policies.allowed_backend_types ?? record.allowed_backend_types;
  return {
    id,
    name: readString(record.user_role_name) ?? readString(record.name) ?? id,
    systemRole: readString(record.system_role),
    permissions: readStrings(record.permissions),
    maxAgents,
    tokenQuota,
    workspaceRootDir,
    allowedBackendTypes: readStrings(backends),
  };
}

function parsePermission(value: unknown): OctopPermission | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const key = readString(record.key) ?? readString(record.id);
  if (!key) return undefined;
  return {
    key,
    category: readString(record.category),
    label: readString(record.label),
  };
}

function parseExpert(value: unknown): OctopPublishedExpert | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = readString(record.id);
  if (!id) return undefined;
  return {
    id,
    slug: readString(record.slug),
    name: readString(record.name),
    description: readString(record.description),
    creatorUsername: readString(record.creator_username),
    iconUrl: readString(record.icon_url),
    updatedAt: readString(record.updated_at),
  };
}

function parseDefaultExpert(value: unknown): OctopDefaultExpert | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    requested: record.requested === true,
    source: readString(record.source),
    templateId: readString(record.template_id),
    status: readString(record.status),
    agentId: readString(record.agent_id),
    bootstrapStatus: readString(record.bootstrap_status),
    errorCode: readString(record.error_code),
    errorMessage: readString(record.error_message),
  };
}

interface OctopFieldDetail {
  readonly loc: readonly (string | number)[];
  readonly msg: string;
  readonly type: string | null;
}

function readValidationDetails(
  payload: unknown,
): readonly OctopFieldDetail[] | undefined {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.detail)) return undefined;
  return record.detail.map((entry) => {
    const item = asRecord(entry);
    const loc = Array.isArray(item?.loc)
      ? item.loc.filter(
          (part): part is string | number =>
            typeof part === 'string' || typeof part === 'number',
        )
      : [];
    const msg =
      typeof item?.msg === 'string' ? item.msg.slice(0, 200) : 'invalid';
    return {
      loc,
      msg,
      type: typeof item?.type === 'string' ? item.type : null,
    };
  });
}

function readOctopCode(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;
  const nested = asRecord(record.error);
  if (nested && typeof nested.code === 'string') return nested.code;
  return typeof record.code === 'string' ? record.code : undefined;
}

function payloadWasAlreadyInstalled(record: Record<string, unknown>): boolean {
  return (
    record.already_installed === true ||
    record.alreadyInstalled === true ||
    readString(record.status)?.toLowerCase() === 'already_installed'
  );
}

function readToken(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;
  const direct =
    readString(record.access_token) ??
    readString(record.token) ??
    readString(record.accessToken);
  if (direct) return direct;
  const nested = asRecord(record.data) ?? asRecord(record.token);
  if (!nested) return undefined;
  return (
    readString(nested.access_token) ??
    readString(nested.token) ??
    readString(nested.accessToken) ??
    undefined
  );
}

/** Removes known secret values from a message. Used if a caller logs text. */
export function redactOctopSecrets(
  message: string,
  secrets: readonly string[],
): string {
  let text = message.replace(
    /Bearer\s+[A-Za-z0-9._~+/-]+=*/gu,
    'Bearer [redacted]',
  );
  text = text.replace(
    /authorization\s*[:=]\s*\S+/giu,
    'authorization=[redacted]',
  );
  for (const secret of secrets) {
    if (secret && secret.length >= 4)
      text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 500);
}
