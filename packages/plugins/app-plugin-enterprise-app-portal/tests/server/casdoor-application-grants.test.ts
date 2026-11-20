import { describe, expect, it } from 'vitest';

import { CasdoorApplicationGrants } from '../../server/services/casdoor-application-grants.js';
import { CasdoorManagementClient } from '../../server/services/casdoor-management-client.js';

const settings = {
  endpoint: 'https://casdoor.test',
  clientId: 'portal-client',
  clientSecret: 'portal-secret',
  organization: 'smartcore',
  applicationOwner: 'admin',
  permissionOwner: 'smartcore',
  auth: 'query' as const,
  permissionNamePrefix: 'nocobase-portal-app-',
};

interface PermissionRow {
  owner: string;
  name: string;
  displayName: string;
  users: string[];
  groups: string[];
  roles: string[];
  resources: string[];
  actions: string[];
  resourceType: string;
  effect: string;
  state: string;
  isEnabled: boolean;
}

function createStore() {
  const applications = [
    {
      name: 'octop',
      displayName: 'Octop',
      organization: 'smartcore',
      owner: 'admin',
      clientSecret: 'hidden-app-secret',
    },
    {
      name: 'open-buddy',
      displayName: 'Buddy',
      organization: 'smartcore',
      owner: 'admin',
    },
  ];
  const permissions: PermissionRow[] = [
    {
      owner: 'smartcore',
      name: 'unrelated-admin',
      displayName: 'unrelated',
      users: ['smartcore/alice'],
      groups: [],
      roles: [],
      resources: ['other'],
      actions: ['Write'],
      resourceType: 'Custom',
      effect: 'Allow',
      state: 'Approved',
      isEnabled: true,
    },
    {
      owner: 'smartcore',
      name: 'nocobase-portal-app-open-buddy',
      displayName: 'open-buddy',
      users: ['smartcore/bob'],
      groups: ['smartcore/staff'],
      roles: ['smartcore/readers'],
      resources: ['open-buddy'],
      actions: ['Read'],
      resourceType: 'Application',
      effect: 'Allow',
      state: 'Approved',
      isEnabled: true,
    },
  ];
  const posts: { path: string; body: unknown }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body =
      typeof init?.body === 'string' && init.body.startsWith('{')
        ? (JSON.parse(init.body) as PermissionRow)
        : typeof init?.body === 'string' && init.body.startsWith('[')
          ? (JSON.parse(init.body) as string[])
          : undefined;
    if (init?.method === 'POST') posts.push({ path: url.pathname, body });
    if (url.pathname === '/api/get-applications') {
      return Response.json({
        status: 'ok',
        data: applications,
        data2: applications.length,
      });
    }
    if (url.pathname === '/api/get-permissions') {
      return Response.json({ status: 'ok', data: permissions });
    }
    if (
      url.pathname === '/api/add-permission' &&
      body &&
      !Array.isArray(body)
    ) {
      permissions.push(body);
      return Response.json({ status: 'ok', data: 'Affected' });
    }
    if (
      url.pathname === '/api/update-permission' &&
      body &&
      !Array.isArray(body)
    ) {
      const id = url.searchParams.get('id');
      const index = permissions.findIndex(
        (permission) => `${permission.owner}/${permission.name}` === id,
      );
      if (index >= 0) permissions[index] = body;
      return Response.json({ status: 'ok', data: 'Affected' });
    }
    if (url.pathname === '/api/enforce' && Array.isArray(body)) {
      const id = url.searchParams.get('permissionId');
      const permission = permissions.find(
        (row) => `${row.owner}/${row.name}` === id,
      );
      if (!permission) {
        return Response.json({
          status: 'error',
          msg: `The permission: "${id}" doesn't exist`,
        });
      }
      const [subject, resource, action] = body;
      const allowed =
        permission.isEnabled &&
        permission.effect === 'Allow' &&
        permission.actions.includes(String(action)) &&
        (permission.resources.includes(String(resource)) ||
          permission.resources.includes('*')) &&
        (permission.users.includes(String(subject)) ||
          permission.groups.length > 0 ||
          permission.roles.length > 0);
      return Response.json({ status: 'ok', data: [allowed] });
    }
    return Response.json({ status: 'error', msg: 'unexpected' });
  };
  return { permissions, posts, fetchImpl };
}

function grantsFor(store: ReturnType<typeof createStore>) {
  const client = new CasdoorManagementClient(settings, store.fetchImpl);
  return new CasdoorApplicationGrants(() => client);
}

describe('CasdoorApplicationGrants', () => {
  it('adds a namespaced permission without rewriting unrelated rows', async () => {
    const store = createStore();
    const grants = grantsFor(store);
    const view = await grants.replace('smartcore/alice', ['octop']);
    expect(view.grants).toEqual([
      expect.objectContaining({
        applicationName: 'octop',
        permissionName: 'nocobase-portal-app-octop',
        source: 'direct',
        enforced: true,
      }),
      expect.objectContaining({
        applicationName: 'open-buddy',
        source: 'inherited',
        enforced: true,
        viaGroups: ['smartcore/staff'],
        viaRoles: ['smartcore/readers'],
      }),
    ]);
    const added = store.posts.find(
      (post) => post.path === '/api/add-permission',
    );
    expect(added?.body).toMatchObject({
      owner: 'smartcore',
      name: 'nocobase-portal-app-octop',
      users: ['smartcore/alice'],
      resourceType: 'Application',
      resources: ['octop'],
      actions: ['Read'],
      effect: 'Allow',
      state: 'Approved',
      isEnabled: true,
    });
    expect(
      store.posts.some(
        (post) =>
          JSON.stringify(post.body).includes('unrelated-admin') &&
          post.path !== '/api/enforce',
      ),
    ).toBe(false);
    expect(store.permissions[0]).toMatchObject({
      name: 'unrelated-admin',
      users: ['smartcore/alice'],
      actions: ['Write'],
    });
    const mutations = () =>
      store.posts.filter((post) => post.path !== '/api/enforce');
    const before = mutations().length;
    await grants.replace('smartcore/alice', ['octop']);
    expect(mutations()).toHaveLength(before);
  });

  it('keeps other users and leaves an inherited grant after revoke', async () => {
    const store = createStore();
    store.permissions.push({
      owner: 'smartcore',
      name: 'nocobase-portal-app-octop',
      displayName: 'octop',
      users: ['smartcore/bob'],
      groups: [],
      roles: [],
      resources: ['octop'],
      actions: ['Read'],
      resourceType: 'Application',
      effect: 'Allow',
      state: 'Approved',
      isEnabled: true,
    });
    const grants = grantsFor(store);
    await grants.replace('smartcore/alice', ['octop']);
    const updated = store.posts.find(
      (post) => post.path === '/api/update-permission',
    );
    expect(updated?.body).toMatchObject({
      users: ['smartcore/bob', 'smartcore/alice'],
      groups: [],
      actions: ['Read'],
    });
    store.posts.length = 0;
    const revoked = await grants.replace('smartcore/alice', []);
    expect(revoked.grants.map((grant) => grant.applicationName)).toEqual([
      'open-buddy',
    ]);
    expect(revoked.grants[0]).toMatchObject({ source: 'inherited' });
    const octop = store.permissions.find(
      (permission) => permission.name === 'nocobase-portal-app-octop',
    );
    expect(octop?.users).toEqual(['smartcore/bob']);
  });

  it('rejects an unknown application before writing', async () => {
    const store = createStore();
    const grants = grantsFor(store);
    await expect(
      grants.replace('smartcore/alice', ['missing']),
    ).rejects.toMatchObject({ reason: 'APPLICATION_UNKNOWN' });
    expect(store.posts).toEqual([]);
  });

  it('fails closed when Casdoor is not configured', async () => {
    const grants = new CasdoorApplicationGrants(() => undefined);
    await expect(grants.list('smartcore/alice')).rejects.toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'CASDOOR_MANAGEMENT_UNAVAILABLE',
    });
  });

  it('does not report a grant that Casdoor will not enforce', async () => {
    const store = createStore();
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/enforce') {
        return Response.json({ status: 'ok', data: [false] });
      }
      return store.fetchImpl(input, init);
    };
    const grants = new CasdoorApplicationGrants(
      () => new CasdoorManagementClient(settings, fetchImpl),
    );
    await expect(
      grants.replace('smartcore/alice', ['octop']),
    ).rejects.toMatchObject({
      status: 'FAILED_PRECONDITION',
      reason: 'GRANT_NOT_ENFORCED',
    });
  });
});
