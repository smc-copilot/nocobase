import { portalError } from '../errors.js';
import type { ApplicationCatalogService } from './application-catalog.js';
import type { PortalApplicationRecord } from './application-catalog.js';
import type { CasdoorApplicationGrants } from './casdoor-application-grants.js';
import type { CasdoorUserView } from './casdoor-management-client.js';
import type { OctopManagementClient } from './octop-management-client.js';
import type {
  OctopAgent,
  OctopPermission,
  OctopPublishedExpert,
  OctopRole,
  OctopUser,
} from './octop-management-client.js';

export interface AgentGrantApplicationView {
  readonly appCode: string;
  readonly name: string;
  readonly appType: 'octop';
  readonly casdoorAppKey: string | null;
  readonly enabled: boolean;
  readonly agentGrantsEnabled: boolean;
  readonly apiBaseUrl: string | null;
  readonly apiAuthMode: string | null;
  readonly apiTokenEnv: string | null;
  readonly apiUsernameEnv: string | null;
  readonly apiPasswordEnv: string | null;
}

export interface AuthorizedEmployeeView {
  readonly casdoorUserId: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
}

export interface InstalledExpertView {
  readonly agentId: string;
  readonly publishedExpertId: string | null;
  readonly name: string | null;
  readonly state: string | null;
  readonly bootstrapPending: boolean;
  readonly kind: string | null;
}

export interface EmployeeOctopState {
  readonly casdoorUserId: string;
  readonly username: string;
  readonly accountExists: boolean;
  readonly disabled: boolean;
  readonly octopUserId: string | null;
  readonly experts: readonly InstalledExpertView[];
}

export interface AgentGrantCreateOptions {
  readonly roles: readonly OctopRole[];
  readonly permissions: readonly OctopPermission[];
  readonly ldapConfigured: boolean;
  readonly supportedBackendTypes: readonly string[];
  readonly directoryLocked: true;
  readonly expertTemplateSource: 'published';
}

/**
 * NFKC, trim, then default Unicode case fold.
 * JavaScript `toLowerCase` leaves `ß` unchanged, so that fold is applied here.
 */
export function octopUsernameKey(value: string): string {
  return casefold(value.normalize('NFKC').trim());
}

function casefold(value: string): string {
  return value
    .replace(/\u00DF/gu, 'ss')
    .replace(/\u0130/gu, 'i\u0307')
    .toLowerCase()
    .replace(/\u03C2/gu, '\u03C3');
}

export function matchOctopUser(
  users: readonly OctopUser[],
  username: string,
): OctopUser | null {
  const key = octopUsernameKey(username);
  const matches = users.filter(
    (user) => octopUsernameKey(user.username) === key,
  );
  if (matches.length > 1) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_USERNAME_AMBIGUOUS',
      'More than one Octop user matches this username.',
    );
  }
  return matches[0] ?? null;
}

export class AgentGrantsReadService {
  public constructor(
    private readonly catalog: ApplicationCatalogService,
    private readonly grants: CasdoorApplicationGrants,
    private readonly openClient: (
      app: PortalApplicationRecord,
    ) => Promise<OctopManagementClient>,
  ) {}

  public async listAgentGrantApplications(): Promise<
    readonly AgentGrantApplicationView[]
  > {
    const rows = await this.catalog.list();
    return rows
      .filter((row) => row.appType === 'octop' && row.agentGrantsEnabled)
      .map(toApplicationView);
  }

  public async listAuthorizedEmployees(
    appCode: string,
  ): Promise<readonly AuthorizedEmployeeView[]> {
    const app = await this.requireGrantApplication(appCode);
    if (!app.casdoorAppKey) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_API_NOT_CONFIGURED',
        'This Octop application has no Casdoor application key.',
      );
    }
    const users = await this.grants.listApplicationUsers(app.casdoorAppKey);
    return users.map(toEmployee);
  }

  public async getEmployeeOctopState(
    appCode: string,
    casdoorUserId: string,
  ): Promise<EmployeeOctopState> {
    const app = await this.requireGrantApplication(appCode);
    const employee = await this.requireEmployee(casdoorUserId);
    await this.requireApplicationGrant(app, casdoorUserId);
    const client = await this.openClient(app);
    const users = await client.getUsers();
    const match = matchOctopUser(users, employee.name);
    if (!match) {
      return {
        casdoorUserId,
        username: employee.name,
        accountExists: false,
        disabled: false,
        octopUserId: null,
        experts: [],
      };
    }
    const agents = await client.getAgents('all');
    return {
      casdoorUserId,
      username: employee.name,
      accountExists: true,
      disabled: match.disabled,
      octopUserId: match.id,
      experts: agents
        .filter(
          (agent) => agent.kind === 'expert' && agentOwnedBy(agent, match),
        )
        .map(toExpertView),
    };
  }

  public async listTemplates(
    appCode: string,
  ): Promise<readonly OctopPublishedExpert[]> {
    const app = await this.requireGrantApplication(appCode);
    const client = await this.openClient(app);
    return client.getPublishedExperts();
  }

  public async listCreateOptions(
    appCode: string,
  ): Promise<AgentGrantCreateOptions> {
    const app = await this.requireGrantApplication(appCode);
    const client = await this.openClient(app);
    const roles = (await client.getRoles()).filter(
      (role) => role.systemRole?.toLowerCase() !== 'admin',
    );
    const permissions = await client.getPermissions();
    const ldap = await client.getLdapConfig();
    const backends = new Set<string>();
    for (const role of roles) {
      for (const backend of role.allowedBackendTypes) backends.add(backend);
    }
    return {
      roles,
      permissions,
      ldapConfigured: ldap.configured,
      supportedBackendTypes: [...backends].sort(),
      directoryLocked: true,
      expertTemplateSource: 'published',
    };
  }

  public async requireGrantApplication(
    appCode: string,
  ): Promise<PortalApplicationRecord> {
    const app = await this.catalog.getByCode(appCode);
    if (!app) {
      throw portalError(
        'NOT_FOUND',
        'OCTOP_APPLICATION_NOT_FOUND',
        'No application matches this code.',
      );
    }
    if (app.appType !== 'octop') {
      throw portalError(
        'FAILED_PRECONDITION',
        'APP_TYPE_NOT_SUPPORTED',
        'Agent Grants only supports Octop applications.',
      );
    }
    if (!app.agentGrantsEnabled) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_API_NOT_CONFIGURED',
        'Agent Grants is not enabled for this application.',
      );
    }
    return app;
  }

  public async requireEmployee(
    casdoorUserId: string,
  ): Promise<CasdoorUserView> {
    const employee = await this.grants.findUser(casdoorUserId);
    if (!employee || employee.isForbidden || employee.isDeleted) {
      throw portalError(
        'PERMISSION_DENIED',
        'CASDOOR_USER_NOT_AUTHORIZED',
        'The Casdoor user is missing, forbidden, or deleted.',
      );
    }
    return employee;
  }

  private async requireApplicationGrant(
    app: PortalApplicationRecord,
    casdoorUserId: string,
  ): Promise<void> {
    if (!app.casdoorAppKey) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_API_NOT_CONFIGURED',
        'This Octop application has no Casdoor application key.',
      );
    }
    const access = await this.grants.list(casdoorUserId);
    const allowed = access.grants.some(
      (grant) => grant.applicationName === app.casdoorAppKey && grant.enforced,
    );
    if (!allowed) {
      throw portalError(
        'PERMISSION_DENIED',
        'CASDOOR_USER_NOT_AUTHORIZED',
        'Casdoor does not allow this employee to use the application.',
      );
    }
  }
}

function toApplicationView(
  row: PortalApplicationRecord,
): AgentGrantApplicationView {
  return {
    appCode: row.appCode,
    name: row.name,
    appType: 'octop',
    casdoorAppKey: row.casdoorAppKey,
    enabled: row.enabled,
    agentGrantsEnabled: row.agentGrantsEnabled,
    apiBaseUrl: row.apiBaseUrl,
    apiAuthMode: row.apiAuthMode,
    apiTokenEnv: row.apiTokenEnv,
    apiUsernameEnv: row.apiUsernameEnv,
    apiPasswordEnv: row.apiPasswordEnv,
  };
}

function toEmployee(user: CasdoorUserView): AuthorizedEmployeeView {
  const casdoorUserId = user.id.includes('/')
    ? user.id
    : `${user.owner}/${user.name}`;
  return {
    casdoorUserId,
    username: user.name,
    displayName: user.displayName,
    email: user.email,
  };
}

function agentOwnedBy(agent: OctopAgent, user: OctopUser): boolean {
  if (agent.userId && agent.userId === user.id) return true;
  if (!agent.ownerUsername) return false;
  return (
    octopUsernameKey(agent.ownerUsername) === octopUsernameKey(user.username)
  );
}

function toExpertView(agent: OctopAgent): InstalledExpertView {
  return {
    agentId: agent.agentId,
    publishedExpertId: agent.publishedExpertId,
    name: agent.name,
    state: agent.state,
    bootstrapPending: agent.bootstrapPending,
    kind: agent.kind,
  };
}
