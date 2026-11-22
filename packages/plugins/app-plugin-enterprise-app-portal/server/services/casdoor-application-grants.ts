import { ApiError } from '@nocobase/app-server/router';

import { portalError } from '../errors.js';
import {
  applicationNameFromPermission,
  isDuplicatePermission,
  namespacedPermissionName,
  type CasdoorApplicationView,
  type CasdoorConnectionStatus,
  type CasdoorGroupView,
  type CasdoorManagementClient,
  type CasdoorPermission,
  type CasdoorUserView,
  CasdoorManagementError,
} from './casdoor-management-client.js';

const PERMISSION_NAME_MAX = 100;
const READ_ACTION = 'Read';

export interface ApplicationGrantView {
  readonly applicationName: string;
  readonly permissionName: string;
  readonly source: 'direct' | 'inherited';
  readonly enforced: boolean;
  readonly viaGroups: readonly string[];
  readonly viaRoles: readonly string[];
  readonly viaUsers: readonly string[];
}

export interface UserApplicationGrants {
  readonly casdoorUserId: string;
  readonly grants: readonly ApplicationGrantView[];
}

export class CasdoorApplicationGrants {
  public constructor(
    private readonly client: () => CasdoorManagementClient | undefined,
    private readonly afterWrite: () => void = () => undefined,
  ) {}

  public async testConnection(): Promise<CasdoorConnectionStatus> {
    return this.guard((client) => client.testConnection());
  }

  public async listUsers(input: {
    readonly organization?: string;
    readonly query?: string;
    readonly groupName?: string;
    readonly page?: number;
    readonly pageSize?: number;
  }): Promise<{
    readonly users: readonly CasdoorUserView[];
    readonly total: number;
  }> {
    return this.guard((client) =>
      client.listUsers({
        organization: input.organization ?? client.organization(),
        query: input.query,
        groupName: input.groupName,
        page: input.page,
        pageSize: input.pageSize,
      }),
    );
  }

  public async listGroups(
    input: {
      readonly organization?: string;
    } = {},
  ): Promise<readonly CasdoorGroupView[]> {
    return this.guard((client) =>
      client.listAllGroups(input.organization ?? client.organization()),
    );
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
    return this.guard((client) => client.listApplications(input));
  }

  public async findUser(
    casdoorUserId: string,
  ): Promise<CasdoorUserView | undefined> {
    const userId = requireUserId(casdoorUserId);
    const name = userId.slice(userId.indexOf('/') + 1);
    return this.guard(async (client) => {
      const listed = await client.listUsers({
        organization: client.organization(),
        query: name,
        page: 1,
        pageSize: 50,
      });
      return listed.users.find(
        (user) => user.id === userId || `${user.owner}/${user.name}` === userId,
      );
    });
  }

  /**
   * Employees Casdoor enforce allows for one application.
   * Direct permission users and inherited group or role grants both qualify.
   * Forbidden and deleted users are omitted. A missing or disabled permission
   * yields an empty list. Enforce is the authority; a deny or an unreadable
   * decision excludes the employee.
   */
  public async listApplicationUsers(
    applicationName: string,
  ): Promise<readonly CasdoorUserView[]> {
    return this.guard(async (client) => {
      const permissions = await client.listPermissions(
        client.permissionOwner(),
      );
      const permission = namespaced(client, permissions).find(
        (entry) =>
          applicationNameFromPermission(
            client.permissionNamePrefix(),
            entry.name,
          ) === applicationName,
      );
      if (!permission || !permission.isEnabled) return [];
      const users: CasdoorUserView[] = [];
      const pageSize = 100;
      for (let page = 1; page <= 20; page += 1) {
        const listed = await client.listUsers({
          organization: client.organization(),
          page,
          pageSize,
        });
        for (const user of listed.users) {
          if (user.isForbidden || user.isDeleted) continue;
          const id = user.id.includes('/')
            ? user.id
            : `${user.owner}/${user.name}`;
          const decision = await client.enforce({
            permissionId: permissionId(permission),
            subject: id,
            resource: applicationName,
            action: READ_ACTION,
          });
          if (decision !== 'allow') continue;
          users.push(user);
        }
        if (listed.users.length < pageSize) break;
      }
      users.sort((left, right) => left.name.localeCompare(right.name));
      return users;
    });
  }

  public async list(casdoorUserId: string): Promise<UserApplicationGrants> {
    return this.guard(async (client) => {
      const userId = requireUserId(casdoorUserId);
      const permissions = await client.listPermissions(
        client.permissionOwner(),
      );
      const grants: ApplicationGrantView[] = [];
      for (const permission of namespaced(client, permissions)) {
        const applicationName = applicationNameFromPermission(
          client.permissionNamePrefix(),
          permission.name,
        );
        if (!applicationName) continue;
        const decision = await client.enforce({
          permissionId: permissionId(permission),
          subject: userId,
          resource: applicationName,
          action: READ_ACTION,
        });
        const view = toGrant(permission, userId, applicationName, decision);
        if (view) grants.push(view);
      }
      grants.sort((left, right) =>
        left.applicationName.localeCompare(right.applicationName),
      );
      return { casdoorUserId: userId, grants };
    });
  }

  public async replace(
    casdoorUserId: string,
    applicationNames: readonly string[],
  ): Promise<UserApplicationGrants> {
    return this.guard(async (client) => {
      const userId = requireUserId(casdoorUserId);
      const desired = unique(applicationNames);
      for (const name of desired) {
        if (!validApplicationName(client.permissionNamePrefix(), name)) {
          throw portalError(
            'INVALID_ARGUMENT',
            'APPLICATION_NAME_INVALID',
            `Application name ${name} cannot be used as a portal permission name.`,
          );
        }
      }
      const permissions = await client.listPermissions(
        client.permissionOwner(),
      );
      const owned = namespaced(client, permissions);
      const byName = new Map<string, CasdoorPermission>();
      for (const permission of owned) {
        const applicationName = applicationNameFromPermission(
          client.permissionNamePrefix(),
          permission.name,
        );
        if (applicationName) byName.set(applicationName, permission);
      }
      const knownNames = new Set(
        (await client.listApplications()).applications.map((app) => app.name),
      );
      // Casdoor renames leave stale permission names in the UI selection. Drop
      // those (they are revoked below) but still reject brand-new unknown names.
      const desiredKnown: string[] = [];
      for (const name of desired) {
        if (knownNames.has(name)) {
          desiredKnown.push(name);
          continue;
        }
        const stale = byName.get(name);
        if (stale?.users.includes(userId)) continue;
        throw portalError(
          'INVALID_ARGUMENT',
          'APPLICATION_UNKNOWN',
          `Casdoor has no application named ${name}.`,
        );
      }
      const desiredSet = new Set(desiredKnown);
      for (const applicationName of desiredKnown) {
        const existing = byName.get(applicationName);
        if (!existing) {
          await this.addGrant(client, userId, applicationName);
          continue;
        }
        if (!existing.users.includes(userId)) {
          await client.updatePermission(
            permissionId(existing),
            withUsers(existing, [...existing.users, userId]),
          );
        }
      }
      for (const permission of owned) {
        const applicationName = applicationNameFromPermission(
          client.permissionNamePrefix(),
          permission.name,
        );
        if (!applicationName || desiredSet.has(applicationName)) continue;
        if (!permission.users.includes(userId)) continue;
        await client.updatePermission(
          permissionId(permission),
          withUsers(
            permission,
            permission.users.filter((user) => user !== userId),
          ),
        );
      }
      this.afterWrite();
      const view = await this.list(userId);
      this.assertConverged(view, desiredSet);
      return view;
    });
  }

  private async addGrant(
    client: CasdoorManagementClient,
    userId: string,
    applicationName: string,
  ): Promise<void> {
    const name = namespacedPermissionName(
      client.permissionNamePrefix(),
      applicationName,
    );
    const body = {
      owner: client.permissionOwner(),
      name,
      displayName: applicationName,
      description: `Portal read access for ${applicationName}`,
      users: [userId],
      groups: [],
      roles: [],
      domains: [],
      model: '',
      adapter: '',
      resourceType: 'Application',
      resources: [applicationName],
      actions: [READ_ACTION],
      effect: 'Allow',
      isEnabled: true,
      submitter: '',
      approver: '',
      approveTime: '',
      state: 'Approved',
      createdTime: new Date().toISOString(),
    };
    try {
      await client.addPermission(body);
    } catch (error) {
      if (!isDuplicatePermission(error)) throw error;
      const existing = await client.getPermission(
        `${client.permissionOwner()}/${name}`,
      );
      if (!existing) throw error;
      if (!existing.users.includes(userId)) {
        await client.updatePermission(
          permissionId(existing),
          withUsers(existing, [...existing.users, userId]),
        );
      }
    }
  }

  private assertConverged(
    view: UserApplicationGrants,
    desired: ReadonlySet<string>,
  ): void {
    const byName = new Map(
      view.grants.map((grant) => [grant.applicationName, grant]),
    );
    for (const name of desired) {
      const grant = byName.get(name);
      if (!grant || grant.source !== 'direct' || !grant.enforced) {
        throw portalError(
          'FAILED_PRECONDITION',
          'GRANT_NOT_ENFORCED',
          `Casdoor did not enforce a direct Read grant for ${name}.`,
        );
      }
    }
    for (const grant of view.grants) {
      if (grant.source === 'direct' && !desired.has(grant.applicationName)) {
        throw portalError(
          'FAILED_PRECONDITION',
          'GRANT_NOT_REVOKED',
          `Casdoor still has a direct grant for ${grant.applicationName}.`,
        );
      }
    }
  }

  private async guard<T>(
    run: (client: CasdoorManagementClient) => Promise<T>,
  ): Promise<T> {
    const client = this.client();
    if (!client) {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_MANAGEMENT_UNAVAILABLE',
        'Casdoor management credentials are not configured.',
      );
    }
    try {
      return await run(client);
    } catch (error) {
      if (isApiError(error)) throw error;
      if (error instanceof CasdoorManagementError) {
        throw portalError(
          'UNAVAILABLE',
          'CASDOOR_MANAGEMENT_UNAVAILABLE',
          error.message,
        );
      }
      throw error;
    }
  }
}

function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function requireUserId(casdoorUserId: string): string {
  const slash = casdoorUserId.indexOf('/');
  if (
    slash <= 0 ||
    slash !== casdoorUserId.lastIndexOf('/') ||
    slash === casdoorUserId.length - 1
  ) {
    throw portalError(
      'INVALID_ARGUMENT',
      'CASDOOR_USER_ID_INVALID',
      'Casdoor user id must be owner/name.',
    );
  }
  return casdoorUserId;
}

function validApplicationName(
  prefix: string,
  applicationName: string,
): boolean {
  if (!applicationName || applicationName !== applicationName.trim())
    return false;
  if (
    applicationName.includes('/') ||
    applicationName.includes('\\') ||
    applicationName.includes('\0')
  ) {
    return false;
  }
  const full = namespacedPermissionName(prefix, applicationName);
  return full.length <= PERMISSION_NAME_MAX;
}

function namespaced(
  client: CasdoorManagementClient,
  permissions: readonly CasdoorPermission[],
): CasdoorPermission[] {
  const prefix = client.permissionNamePrefix();
  return permissions.filter((permission) => permission.name.startsWith(prefix));
}

function permissionId(permission: CasdoorPermission): string {
  return `${permission.owner}/${permission.name}`;
}

function withUsers(
  permission: CasdoorPermission,
  users: readonly string[],
): Record<string, unknown> {
  return {
    ...permission.raw,
    owner: permission.owner,
    name: permission.name,
    users: [...users],
  };
}

function unique(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function wildcardUsers(users: readonly string[], userId: string): string[] {
  return users.filter(
    (user) => user !== userId && (user === '*' || user.endsWith('/*')),
  );
}

function toGrant(
  permission: CasdoorPermission,
  userId: string,
  applicationName: string,
  decision: 'allow' | 'deny' | 'missing',
): ApplicationGrantView | undefined {
  const direct = permission.users.includes(userId);
  if (!direct && decision !== 'allow') return undefined;
  return {
    applicationName,
    permissionName: permission.name,
    source: direct ? 'direct' : 'inherited',
    enforced: decision === 'allow',
    viaGroups: [...permission.groups],
    viaRoles: [...permission.roles],
    viaUsers: wildcardUsers(permission.users, userId),
  };
}
