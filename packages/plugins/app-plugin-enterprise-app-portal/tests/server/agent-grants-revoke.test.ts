import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

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

describe('agent grant revoke unsynced employee', () => {
  let harness: PortalHarness;
  const env: Record<string, string | undefined> = {
    CASDOOR_CLIENT_ID: 'portal-client',
    CASDOOR_CLIENT_SECRET: 'portal-secret',
    OCTOP_ADMIN_TOKEN: 'octop-test-token',
  };

  const store: {
    permissions: PermissionRow[];
    octopUsers: { id: number; username: string }[];
  } = {
    permissions: [],
    octopUsers: [],
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    if (url.hostname === 'casdoor.test') return casdoor(url, init);
    if (url.hostname === 'octop.example.com') return octop(url);
    return new Response('ok', { status: 200 });
  };

  beforeAll(async () => {
    harness = await createPortalHarness(
      {
        launchHostAllowlist: ['example.com'],
        octopApiHostAllowlist: ['octop.example.com'],
        access: {
          source: 'managementApi',
          managementApi: {
            endpoint: 'https://casdoor.test',
            organization: 'smartcore',
          },
        },
      },
      { env, fetchImpl },
    );
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    store.octopUsers = [];
    store.permissions = [
      {
        owner: 'smartcore',
        name: 'nocobase-portal-app-octop',
        displayName: 'Octop',
        users: ['smartcore/alice', 'smartcore/bob'],
        groups: [],
        roles: [],
        resources: ['octop'],
        actions: ['Read'],
        resourceType: 'Application',
        effect: 'Allow',
        state: 'Approved',
        isEnabled: true,
      },
    ];
    const { query } = harness.database.connection();
    await query
      .deleteFrom('enterprisePortalAuditEvents')
      .allowAllRows()
      .execute();
    await query
      .deleteFrom('enterprisePortalApplications')
      .allowAllRows()
      .execute();
    await harness.services.catalog.create(
      {
        appCode: 'octop',
        name: 'Octop',
        appType: 'octop',
        baseUrl: 'https://example.com/apps/octop',
        casdoorAppKey: 'octop',
        agentGrantsEnabled: true,
        apiBaseUrl: 'https://octop.example.com',
        apiAuthMode: 'bearer_env',
        apiTokenEnv: 'OCTOP_ADMIN_TOKEN',
      },
      'admin-1',
    );
  });

  it('revokes a direct grant for an unsynced employee', async () => {
    const result =
      await harness.services.agentGrants.revokeUnsyncedEmployeeGrant(
        'octop',
        'smartcore/alice',
        'admin-1',
      );
    expect(result).toEqual({
      casdoorUserId: 'smartcore/alice',
      applicationName: 'octop',
      stillAuthorized: false,
    });
    expect(store.permissions[0]?.users).toEqual(['smartcore/bob']);
  });

  it('blocks revoke when the Octop account already exists', async () => {
    store.octopUsers = [{ id: 9, username: 'alice' }];
    await expect(
      harness.services.agentGrants.revokeUnsyncedEmployeeGrant(
        'octop',
        'smartcore/alice',
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_ACCOUNT_EXISTS' });
    expect(store.permissions[0]?.users).toEqual([
      'smartcore/alice',
      'smartcore/bob',
    ]);
  });

  it('blocks revoke when access is inherited only', async () => {
    store.permissions[0] = {
      ...store.permissions[0]!,
      users: ['smartcore/bob'],
      groups: ['smartcore/staff'],
    };
    await expect(
      harness.services.agentGrants.revokeUnsyncedEmployeeGrant(
        'octop',
        'smartcore/alice',
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'GRANT_INHERITED' });
  });

  function casdoor(url: URL, init: RequestInit | undefined): Response {
    if (url.searchParams.get('clientSecret') !== 'portal-secret') {
      return Response.json({ status: 'error', msg: 'unauthorized' });
    }
    if (url.pathname === '/api/get-users') {
      const users = [
        user('alice', 'Alice'),
        user('bob', 'Bob'),
        user('carol', 'Carol'),
      ];
      return Response.json({ status: 'ok', data: users, data2: users.length });
    }
    if (url.pathname === '/api/get-applications') {
      return Response.json({
        status: 'ok',
        data: [
          {
            name: 'octop',
            displayName: 'Octop',
            organization: 'smartcore',
            owner: 'admin',
          },
        ],
        data2: 1,
      });
    }
    if (url.pathname === '/api/get-permissions') {
      return Response.json({ status: 'ok', data: store.permissions });
    }
    if (url.pathname === '/api/get-permission') {
      const id = url.searchParams.get('id') ?? '';
      const row = store.permissions.find(
        (permission) => `${permission.owner}/${permission.name}` === id,
      );
      return Response.json({ status: 'ok', data: row ?? null });
    }
    if (url.pathname === '/api/update-permission' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as PermissionRow;
      const index = store.permissions.findIndex(
        (permission) =>
          permission.owner === body.owner && permission.name === body.name,
      );
      if (index >= 0) store.permissions[index] = body;
      return Response.json({ status: 'ok', data: body });
    }
    if (url.pathname === '/api/enforce') {
      const subject = JSON.parse(String(init?.body ?? '[]')) as string[];
      const userId = subject[0] ?? '';
      const permission = store.permissions[0];
      if (!permission?.isEnabled) {
        return Response.json({ status: 'ok', data: false });
      }
      const direct = permission.users.includes(userId);
      const inherited =
        permission.groups.length > 0 && userId === 'smartcore/alice';
      return Response.json({ status: 'ok', data: direct || inherited });
    }
    return Response.json({ status: 'ok', data: [] });
  }

  function octop(url: URL): Response {
    const header = 'Bearer octop-test-token';
    // Auth header checked by caller path — keep simple for GET users/agents.
    if (url.pathname === '/api/users') {
      return Response.json(store.octopUsers);
    }
    if (url.pathname === '/api/agents') {
      return Response.json([]);
    }
    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        db: true,
        users_loaded: store.octopUsers.length,
        agents_running: 0,
      });
    }
    void header;
    return Response.json({ ok: true });
  }
});

function user(name: string, displayName: string) {
  return {
    id: `smartcore/${name}`,
    owner: 'smartcore',
    name,
    displayName,
    email: `${name}@example.com`,
    isForbidden: false,
    isDeleted: false,
  };
}
