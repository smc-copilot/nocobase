import {
  resolveCasdoorManagement,
  type CasdoorManagementAuth,
  type EnterpriseAppPortalAccessConfig,
  type ResolvedCasdoorManagement,
} from '../config.js';

const REQUEST_TIMEOUT_MS = 15_000;

export type EnforceDecision = 'allow' | 'deny' | 'missing';

export interface CasdoorUserView {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  readonly phone: string;
  readonly avatar: string;
  readonly title: string;
  readonly affiliation: string;
  /** Casdoor group ids (`owner/name`), used as the portal department column. */
  readonly groups: readonly string[];
  readonly isForbidden: boolean;
  readonly isDeleted: boolean;
}

export interface CasdoorApplicationView {
  readonly name: string;
  readonly displayName: string;
  readonly organization: string;
  readonly owner: string;
  /** Casdoor homepage URL when set; empty string when absent. */
  readonly homepageUrl: string;
}

export interface CasdoorGroupView {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly displayName: string;
  /** Parent key as Casdoor stores it (usually the parent display name). */
  readonly parentId: string;
  readonly parentName: string;
  readonly isTopGroup: boolean;
  readonly haveChildren: boolean;
  readonly type: string;
  readonly isEnabled: boolean;
}

export interface CasdoorPermission {
  readonly owner: string;
  readonly name: string;
  readonly displayName: string;
  readonly users: readonly string[];
  readonly groups: readonly string[];
  readonly roles: readonly string[];
  readonly resources: readonly string[];
  readonly actions: readonly string[];
  readonly resourceType: string;
  readonly effect: string;
  readonly state: string;
  readonly isEnabled: boolean;
  /** Original Casdoor object. Updates send it back with `users` replaced. */
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface CasdoorConnectionStatus {
  readonly ok: true;
  readonly organization: string;
  readonly applicationOwner: string;
  readonly permissionOwner: string;
  readonly auth: CasdoorManagementAuth;
}

export class CasdoorManagementError extends Error {
  public readonly kind: 'unavailable' | 'rejected' | 'missing';

  public constructor(
    kind: 'unavailable' | 'rejected' | 'missing',
    message: string,
  ) {
    super(message);
    this.name = 'CasdoorManagementError';
    this.kind = kind;
  }
}

export function namespacedPermissionName(
  prefix: string,
  applicationName: string,
): string {
  return `${prefix}${applicationName}`;
}

export function applicationNameFromPermission(
  prefix: string,
  permissionName: string,
): string | undefined {
  if (!permissionName.startsWith(prefix)) return undefined;
  const applicationName = permissionName.slice(prefix.length);
  if (!applicationName || applicationName.includes('/')) return undefined;
  return applicationName;
}

export function isDuplicatePermission(error: unknown): boolean {
  return (
    error instanceof CasdoorManagementError &&
    error.kind === 'rejected' &&
    /duplicate|already exists|primary key/i.test(error.message)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item !== '',
  );
}

function readTotal(data2: unknown, fallback: number): number {
  if (typeof data2 === 'number' && Number.isFinite(data2)) return data2;
  if (typeof data2 === 'string' && /^\d+$/u.test(data2)) return Number(data2);
  return fallback;
}

function parseUser(value: unknown): CasdoorUserView | undefined {
  if (!isRecord(value)) return undefined;
  const owner = readString(value.owner) ?? '';
  const name = readString(value.name) ?? '';
  const id =
    readString(value.id) ?? (owner && name ? `${owner}/${name}` : undefined);
  if (!id || !name) return undefined;
  return {
    id,
    owner,
    name,
    displayName: readString(value.displayName) ?? name,
    email: readString(value.email) ?? '',
    phone: readString(value.phone) ?? '',
    avatar: readString(value.avatar) ?? '',
    title: readString(value.title) ?? '',
    affiliation: readString(value.affiliation) ?? '',
    groups: readStrings(value.groups),
    isForbidden: value.isForbidden === true,
    isDeleted: value.isDeleted === true,
  };
}

function parseApplication(value: unknown): CasdoorApplicationView | undefined {
  if (!isRecord(value)) return undefined;
  const name = readString(value.name);
  if (!name) return undefined;
  return {
    name,
    displayName: readString(value.displayName) ?? name,
    organization: readString(value.organization) ?? '',
    owner: readString(value.owner) ?? '',
    homepageUrl: readString(value.homepageUrl) ?? '',
  };
}

function parseGroup(value: unknown): CasdoorGroupView | undefined {
  if (!isRecord(value)) return undefined;
  const owner = readString(value.owner) ?? '';
  const name = readString(value.name) ?? '';
  if (!owner || !name) return undefined;
  return {
    id: `${owner}/${name}`,
    owner,
    name,
    displayName: readString(value.displayName) ?? name,
    parentId: readString(value.parentId) ?? '',
    parentName: readString(value.parentName) ?? '',
    isTopGroup: value.isTopGroup === true,
    haveChildren: value.haveChildren === true,
    type: readString(value.type) ?? '',
    isEnabled: value.isEnabled !== false,
  };
}

function parsePermission(value: unknown): CasdoorPermission | undefined {
  if (!isRecord(value)) return undefined;
  const owner = readString(value.owner);
  const name = readString(value.name);
  if (!owner || !name) return undefined;
  return {
    owner,
    name,
    displayName: readString(value.displayName) ?? name,
    users: readStrings(value.users),
    groups: readStrings(value.groups),
    roles: readStrings(value.roles),
    resources: readStrings(value.resources),
    actions: readStrings(value.actions),
    resourceType: readString(value.resourceType) ?? '',
    effect: readString(value.effect) ?? '',
    state: readString(value.state) ?? '',
    isEnabled: value.isEnabled !== false,
    raw: value,
  };
}

interface Envelope {
  readonly status: string;
  readonly msg: string;
  readonly data: unknown;
  readonly data2: unknown;
}

function parseEnvelope(body: unknown): Envelope {
  if (!isRecord(body)) {
    throw new CasdoorManagementError(
      'unavailable',
      'Casdoor returned a non-object payload.',
    );
  }
  return {
    status: readString(body.status) ?? '',
    msg: readString(body.msg) ?? '',
    data: body.data,
    data2: body.data2,
  };
}

function readAllowed(data: unknown): boolean {
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data) && typeof data[0] === 'boolean') return data[0];
  throw new CasdoorManagementError(
    'unavailable',
    'Casdoor enforce returned an unexpected payload.',
  );
}

export interface CasdoorClientSource {
  client(): CasdoorManagementClient | undefined;
}

export function createCasdoorClientSource(
  accessConfig: () => EnterpriseAppPortalAccessConfig,
  env: () => Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): CasdoorClientSource {
  let cached:
    | {
        readonly settings: ResolvedCasdoorManagement;
        readonly client: CasdoorManagementClient;
      }
    | undefined;
  return {
    client() {
      const resolved = resolveCasdoorManagement(accessConfig(), env());
      if (!resolved) {
        cached = undefined;
        return undefined;
      }
      if (!cached || !sameSettings(cached.settings, resolved)) {
        cached = {
          settings: resolved,
          client: new CasdoorManagementClient(resolved, fetchImpl),
        };
      }
      return cached.client;
    },
  };
}

function sameSettings(
  left: ResolvedCasdoorManagement,
  right: ResolvedCasdoorManagement,
): boolean {
  return (
    left.endpoint === right.endpoint &&
    left.clientId === right.clientId &&
    left.clientSecret === right.clientSecret &&
    left.organization === right.organization &&
    left.applicationOwner === right.applicationOwner &&
    left.permissionOwner === right.permissionOwner &&
    left.auth === right.auth &&
    left.permissionNamePrefix === right.permissionNamePrefix
  );
}

/**
 * Authenticated Casdoor management client.
 * Query auth matches the identity directory client. Bearer auth uses client_credentials.
 * Responses are parsed here. Callers see directory views and permission records, not raw JSON.
 */
export class CasdoorManagementClient {
  private token:
    { readonly value: string; readonly expiresAt: number } | undefined;

  public constructor(
    private readonly settings: ResolvedCasdoorManagement,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public organization(): string {
    return this.settings.organization;
  }

  public applicationOwner(): string {
    return this.settings.applicationOwner;
  }

  public permissionOwner(): string {
    return this.settings.permissionOwner;
  }

  public permissionNamePrefix(): string {
    return this.settings.permissionNamePrefix;
  }

  public authMode(): CasdoorManagementAuth {
    return this.settings.auth;
  }

  public async testConnection(): Promise<CasdoorConnectionStatus> {
    // Org-scoped management clients can list via `organization` but not
    // `owner=admin`. Prefer the configured organization for the probe.
    await this.listApplications({
      page: 1,
      pageSize: 1,
    });
    return {
      ok: true,
      organization: this.settings.organization,
      applicationOwner: this.settings.applicationOwner,
      permissionOwner: this.settings.permissionOwner,
      auth: this.settings.auth,
    };
  }

  public async listUsers(input: {
    readonly organization: string;
    readonly query?: string;
    /** Casdoor `groupName` filter (group `name`, not owner/name). */
    readonly groupName?: string;
    readonly page?: number;
    readonly pageSize?: number;
  }): Promise<{
    readonly users: readonly CasdoorUserView[];
    readonly total: number;
  }> {
    const envelope = await this.envelope('/api/get-users', {
      method: 'GET',
      query: pageQuery(
        {
          owner: input.organization,
          ...(input.query ? { field: 'name', value: input.query } : {}),
          ...(input.groupName ? { groupName: input.groupName } : {}),
        },
        input.page,
        input.pageSize,
      ),
    });
    const users = readRows(envelope.data)
      .map(parseUser)
      .filter((user): user is CasdoorUserView => user !== undefined);
    return { users, total: readTotal(envelope.data2, users.length) };
  }

  /**
   * Resolves one Casdoor user by owner/name id, raw id, or exact name match.
   * Used for Enforce subject normalization from external identity bindings.
   */
  public async findUserByIdOrName(
    subjectOrName: string,
  ): Promise<CasdoorUserView | undefined> {
    const id = subjectOrName.trim();
    if (!id) return undefined;
    try {
      const envelope = await this.envelope('/api/get-user', {
        method: 'GET',
        query: { id },
      });
      const user = parseUser(envelope.data);
      if (user) return user;
    } catch {
      // Fall through to name search.
    }
    const name = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
    const listed = await this.listUsers({
      organization: this.organization(),
      query: name,
      page: 1,
      pageSize: 50,
    });
    return listed.users.find(
      (user) =>
        user.id === id ||
        `${user.owner}/${user.name}` === id ||
        user.name === name,
    );
  }

  public async listGroups(
    input: {
      readonly organization?: string;
      readonly page?: number;
      readonly pageSize?: number;
    } = {},
  ): Promise<{
    readonly groups: readonly CasdoorGroupView[];
    readonly total: number;
  }> {
    const envelope = await this.envelope('/api/get-groups', {
      method: 'GET',
      query: pageQuery(
        { owner: input.organization ?? this.settings.organization },
        input.page,
        input.pageSize,
      ),
    });
    const groups = readRows(envelope.data)
      .map(parseGroup)
      .filter((group): group is CasdoorGroupView => group !== undefined);
    return { groups, total: readTotal(envelope.data2, groups.length) };
  }

  /** Loads every Casdoor group page for the organization (tree building). */
  public async listAllGroups(
    organization?: string,
  ): Promise<readonly CasdoorGroupView[]> {
    const pageSize = 100;
    const first = await this.listGroups({
      organization,
      page: 1,
      pageSize,
    });
    const all: CasdoorGroupView[] = [...first.groups];
    const total = first.total;
    let page = 1;
    while (all.length < total && page < 50) {
      page += 1;
      const next = await this.listGroups({
        organization,
        page,
        pageSize,
      });
      if (next.groups.length === 0) break;
      all.push(...next.groups);
    }
    return all;
  }

  public async listApplications(
    input: {
      readonly owner?: string;
      readonly organization?: string;
      readonly page?: number;
      readonly pageSize?: number;
    } = {},
  ): Promise<{
    readonly applications: readonly CasdoorApplicationView[];
    readonly total: number;
  }> {
    const envelope = await this.envelope('/api/get-applications', {
      method: 'GET',
      query: pageQuery(
        {
          organization: input.organization ?? this.settings.organization,
          ...(input.owner ? { owner: input.owner } : {}),
        },
        input.page,
        input.pageSize,
      ),
    });
    const applications = readRows(envelope.data)
      .map(parseApplication)
      .filter((app): app is CasdoorApplicationView => app !== undefined);
    return {
      applications,
      total: readTotal(envelope.data2, applications.length),
    };
  }

  public async listPermissions(
    owner: string,
  ): Promise<readonly CasdoorPermission[]> {
    const envelope = await this.envelope('/api/get-permissions', {
      method: 'GET',
      query: { owner },
    });
    return readRows(envelope.data)
      .map(parsePermission)
      .filter(
        (permission): permission is CasdoorPermission =>
          permission !== undefined,
      );
  }

  public async getPermission(id: string): Promise<CasdoorPermission | null> {
    try {
      const envelope = await this.envelope('/api/get-permission', {
        method: 'GET',
        query: { id },
      });
      if (envelope.data == null) return null;
      return parsePermission(envelope.data) ?? null;
    } catch (error) {
      if (error instanceof CasdoorManagementError && error.kind === 'missing') {
        return null;
      }
      throw error;
    }
  }

  public async addPermission(
    permission: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.envelope('/api/add-permission', {
      method: 'POST',
      json: permission,
    });
  }

  public async updatePermission(
    id: string,
    permission: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.envelope('/api/update-permission', {
      method: 'POST',
      query: { id },
      json: permission,
    });
  }

  public async enforce(input: {
    readonly permissionId: string;
    readonly subject: string;
    readonly resource: string;
    readonly action: string;
  }): Promise<EnforceDecision> {
    try {
      const envelope = await this.envelope('/api/enforce', {
        method: 'POST',
        query: { permissionId: input.permissionId },
        json: [input.subject, input.resource, input.action],
      });
      return readAllowed(envelope.data) ? 'allow' : 'deny';
    } catch (error) {
      if (error instanceof CasdoorManagementError && error.kind === 'missing') {
        return 'missing';
      }
      throw error;
    }
  }

  private async envelope(
    path: string,
    init: {
      readonly method: 'GET' | 'POST';
      readonly query?: Readonly<Record<string, string | undefined>>;
      readonly json?: unknown;
    },
  ): Promise<Envelope> {
    const body = await this.request(path, init);
    const envelope = parseEnvelope(body);
    if (envelope.status && envelope.status !== 'ok') {
      this.raise(path, envelope.msg);
    }
    return envelope;
  }

  private raise(path: string, msg: string): never {
    const text = this.redact(msg);
    if (/doesn'?t exist|does not exist|not found/i.test(text)) {
      throw new CasdoorManagementError(
        'missing',
        text || `Casdoor resource for ${path} was not found.`,
      );
    }
    throw new CasdoorManagementError(
      'rejected',
      `Casdoor ${path} error: ${text || 'rejected'}`,
    );
  }

  private async request(
    path: string,
    init: {
      readonly method: 'GET' | 'POST';
      readonly query?: Readonly<Record<string, string | undefined>>;
      readonly json?: unknown;
    },
  ): Promise<unknown> {
    const url = new URL(path, this.settings.endpoint);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.settings.auth === 'query') {
      url.searchParams.set('clientId', this.settings.clientId);
      url.searchParams.set('clientSecret', this.settings.clientSecret);
    } else {
      headers.authorization = `Bearer ${await this.ensureToken()}`;
    }
    if (init.json !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
      });
    } catch {
      throw new CasdoorManagementError(
        'unavailable',
        `Casdoor request to ${path} failed.`,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new CasdoorManagementError(
        'unavailable',
        `Casdoor ${path} answered HTTP ${response.status}.`,
      );
    }
    try {
      const payload: unknown = await response.json();
      return payload;
    } catch {
      throw new CasdoorManagementError(
        'unavailable',
        `Casdoor ${path} returned invalid JSON.`,
      );
    }
  }

  private async ensureToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 5_000)
      return this.token.value;
    const url = new URL(
      '/api/login/oauth/access_token',
      this.settings.endpoint,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.settings.clientId,
          client_secret: this.settings.clientSecret,
        }),
      });
    } catch {
      throw new CasdoorManagementError(
        'unavailable',
        'Casdoor token request failed.',
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new CasdoorManagementError(
        'unavailable',
        `Casdoor token request answered HTTP ${response.status}.`,
      );
    }
    let body: unknown;
    try {
      const payload: unknown = await response.json();
      body = payload;
    } catch {
      throw new CasdoorManagementError(
        'unavailable',
        'Casdoor token response was invalid JSON.',
      );
    }
    if (
      !isRecord(body) ||
      typeof body.access_token !== 'string' ||
      !body.access_token
    ) {
      throw new CasdoorManagementError(
        'unavailable',
        'Casdoor token response did not include an access token.',
      );
    }
    const expiresIn =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in
        : 60;
    this.token = {
      value: body.access_token,
      expiresAt: now + expiresIn * 1000,
    };
    return body.access_token;
  }

  private redact(message: string): string {
    let text = message;
    const secrets = [this.settings.clientSecret, this.token?.value];
    for (const secret of secrets) {
      if (secret) text = text.split(secret).join('[redacted]');
    }
    return text.slice(0, 300);
  }
}

function pageQuery(
  query: Readonly<Record<string, string | undefined>>,
  page: number | undefined,
  pageSize: number | undefined,
): Record<string, string | undefined> {
  if (page === undefined && pageSize === undefined) return { ...query };
  return {
    ...query,
    p: String(page ?? 1),
    pageSize: String(pageSize ?? 100),
  };
}

function readRows(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  throw new CasdoorManagementError(
    'unavailable',
    'Casdoor returned a list payload that is not an array.',
  );
}
