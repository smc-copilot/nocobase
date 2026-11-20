import { describe, expect, it } from 'vitest';

import { resolveCasdoorManagement } from '../../server/config.js';
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

interface Hit {
  readonly method: string;
  readonly path: string;
  readonly search: URLSearchParams;
  readonly body: unknown;
  readonly authorization: string | null;
}

function scriptedFetch(respond: (hit: Hit) => unknown): {
  readonly fetchImpl: typeof fetch;
  readonly hits: Hit[];
} {
  const hits: Hit[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const raw = init?.body;
    const hit: Hit = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
      body:
        typeof raw === 'string' && raw.startsWith('{')
          ? JSON.parse(raw)
          : typeof raw === 'string' && raw.startsWith('[')
            ? JSON.parse(raw)
            : raw,
      authorization:
        init?.headers instanceof Headers
          ? init.headers.get('authorization')
          : ((init?.headers as Record<string, string> | undefined)
              ?.authorization ?? null),
    };
    hits.push(hit);
    return Response.json(respond(hit));
  };
  return { fetchImpl, hits };
}

describe('resolveCasdoorManagement', () => {
  it('reads credentials from the named env vars and ignores a config secret when env is set', () => {
    const resolved = resolveCasdoorManagement(
      {
        managementApi: {
          endpoint: 'https://casdoor.test/root?token=drop',
          organization: 'smartcore',
          clientSecret: 'from-config',
        },
      },
      {
        CASDOOR_CLIENT_ID: 'portal-client',
        CASDOOR_CLIENT_SECRET: 'from-env',
      },
    );
    expect(resolved).toMatchObject({
      endpoint: 'https://casdoor.test/root',
      clientId: 'portal-client',
      clientSecret: 'from-env',
      organization: 'smartcore',
      applicationOwner: 'admin',
      permissionOwner: 'smartcore',
      auth: 'query',
      permissionNamePrefix: 'nocobase-portal-app-',
    });
  });

  it('returns undefined when a credential or a usable prefix is missing', () => {
    expect(
      resolveCasdoorManagement(
        {
          managementApi: {
            endpoint: 'https://casdoor.test',
            organization: 'smartcore',
          },
        },
        { CASDOOR_CLIENT_ID: 'portal-client' },
      ),
    ).toBeUndefined();
    expect(
      resolveCasdoorManagement(
        {
          managementApi: {
            endpoint: 'https://casdoor.test',
            organization: 'smartcore',
            permissionNamePrefix: 'wide',
          },
        },
        {
          CASDOOR_CLIENT_ID: 'portal-client',
          CASDOOR_CLIENT_SECRET: 'portal-secret',
        },
      ),
    ).toBeUndefined();
  });
});

describe('CasdoorManagementClient', () => {
  it('sends query credentials and returns directory views without secrets', async () => {
    const { fetchImpl, hits } = scriptedFetch((hit) => {
      if (hit.path === '/api/get-users') {
        return {
          status: 'ok',
          data: [
            {
              id: 'smartcore/alice',
              owner: 'smartcore',
              name: 'alice',
              displayName: 'Alice',
              email: 'alice@example.com',
              password: 'hash',
              accessSecret: 'secret',
            },
          ],
          data2: 4,
        };
      }
      return {
        status: 'ok',
        data: [
          {
            name: 'octop',
            displayName: 'Octop',
            organization: 'smartcore',
            owner: 'admin',
            clientId: 'app-client',
            clientSecret: 'app-secret',
          },
        ],
        data2: 1,
      };
    });
    const client = new CasdoorManagementClient(settings, fetchImpl);
    const users = await client.listUsers({
      organization: 'smartcore',
      query: 'ali',
      page: 1,
      pageSize: 20,
    });
    expect(users).toEqual({
      users: [
        {
          id: 'smartcore/alice',
          owner: 'smartcore',
          name: 'alice',
          displayName: 'Alice',
          email: 'alice@example.com',
          phone: '',
          avatar: '',
          title: '',
          affiliation: '',
          isForbidden: false,
          isDeleted: false,
        },
      ],
      total: 4,
    });
    expect(JSON.stringify(users)).not.toContain('hash');
    const applications = await client.listApplications();
    expect(applications.applications).toEqual([
      {
        name: 'octop',
        displayName: 'Octop',
        organization: 'smartcore',
        owner: 'admin',
      },
    ]);
    expect(JSON.stringify(applications)).not.toContain('app-secret');
    expect(hits[0]?.search.get('clientId')).toBe('portal-client');
    expect(hits[0]?.search.get('clientSecret')).toBe('portal-secret');
    expect(hits[0]?.search.get('field')).toBe('name');
    expect(hits[0]?.search.get('value')).toBe('ali');
    expect(hits[0]?.authorization).toBeNull();
    expect(
      hits.every((hit) => hit.path !== '/api/login/oauth/access_token'),
    ).toBe(true);
  });

  it('uses a bearer token for client_credentials and keeps the secret off later URLs', async () => {
    const { fetchImpl, hits } = scriptedFetch((hit) => {
      if (hit.path === '/api/login/oauth/access_token') {
        return { access_token: 'token-1', expires_in: 3600 };
      }
      return { status: 'ok', data: [], data2: 0 };
    });
    const client = new CasdoorManagementClient(
      { ...settings, auth: 'clientCredentials' },
      fetchImpl,
    );
    await client.testConnection();
    await client.listApplications();
    const tokenCalls = hits.filter(
      (hit) => hit.path === '/api/login/oauth/access_token',
    );
    expect(tokenCalls).toHaveLength(1);
    expect(String(tokenCalls[0]?.body)).toContain(
      'client_secret=portal-secret',
    );
    const reads = hits.filter((hit) => hit.path === '/api/get-applications');
    expect(reads).toHaveLength(2);
    expect(reads[0]?.authorization).toBe('Bearer token-1');
    expect(reads[0]?.search.get('clientSecret')).toBeNull();
  });

  it('reports a missing permission separately from a transport failure', async () => {
    const { fetchImpl } = scriptedFetch((hit) => {
      const id = hit.search.get('permissionId');
      if (id === 'smartcore/missing') {
        return { status: 'error', msg: 'The permission does not exist' };
      }
      if (id === 'smartcore/denied') return { status: 'ok', data: [false] };
      return { status: 'ok', data: [true] };
    });
    const client = new CasdoorManagementClient(settings, fetchImpl);
    expect(
      await client.enforce({
        permissionId: 'smartcore/missing',
        subject: 'smartcore/alice',
        resource: 'missing',
        action: 'Read',
      }),
    ).toBe('missing');
    expect(
      await client.enforce({
        permissionId: 'smartcore/denied',
        subject: 'smartcore/alice',
        resource: 'denied',
        action: 'Read',
      }),
    ).toBe('deny');
    const down: typeof fetch = async () => new Response('no', { status: 502 });
    const broken = new CasdoorManagementClient(settings, down);
    await expect(broken.testConnection()).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});
