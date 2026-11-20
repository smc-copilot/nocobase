import type { MiddlewareHandler } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SETTINGS_CASDOOR } from '../../server/config.js';
import { createPortalRouter } from '../../server/routes/portal.js';
import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

describe('casdoor admin routes', () => {
  let harness: PortalHarness;
  const env: Record<string, string | undefined> = {
    CASDOOR_CLIENT_ID: 'portal-client',
    CASDOOR_CLIENT_SECRET: 'portal-secret',
  };
  let granted: Set<string>;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('clientSecret') !== 'portal-secret') {
      return Response.json({ status: 'error', msg: 'unauthorized' });
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
            clientSecret: 'hidden-app-secret',
          },
        ],
        data2: 1,
      });
    }
    if (url.pathname === '/api/get-users') {
      return Response.json({
        status: 'ok',
        data: [
          {
            id: 'smartcore/alice',
            owner: 'smartcore',
            name: 'alice',
            displayName: 'Alice',
            password: 'hash',
          },
        ],
        data2: 1,
      });
    }
    if (url.pathname === '/api/get-groups') {
      return Response.json({
        status: 'ok',
        data: [
          {
            owner: 'smartcore',
            name: 'IT',
            displayName: 'IT中心',
            parentId: '芯智控股',
            parentName: '芯智控股',
            isTopGroup: false,
            haveChildren: false,
            type: 'ldap-synced',
            isEnabled: true,
          },
        ],
        data2: 1,
      });
    }
    if (url.pathname === '/api/get-permissions') {
      return Response.json({ status: 'ok', data: [] });
    }
    return Response.json({ status: 'ok', data: 'Affected' });
  };

  beforeAll(async () => {
    harness = await createPortalHarness(
      {
        launchHostAllowlist: ['example.com'],
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

  const router = () => {
    const authenticate: MiddlewareHandler = async (context, next) => {
      context.set('auth', {
        user: { id: 'user-1', username: 'alice' },
      } as never);
      await next();
    };
    return createPortalRouter({
      services: () => harness.services,
      authenticate: [authenticate],
      authorize: (_context, item, action) =>
        Promise.resolve(granted.has(`${item}:${action}`)),
    });
  };

  const send = (method: string, path: string, body?: unknown) =>
    router().request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('answers 503 when management credentials are missing', async () => {
    granted = new Set([`${SETTINGS_CASDOOR}:read`]);
    env.CASDOOR_CLIENT_ID = undefined;
    env.CASDOOR_CLIENT_SECRET = undefined;
    const response = await send('POST', '/admin/casdoor/testConnection');
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: { reason: string } };
    expect(payload.error.reason).toBe('CASDOOR_MANAGEMENT_UNAVAILABLE');
    env.CASDOOR_CLIENT_ID = 'portal-client';
    env.CASDOOR_CLIENT_SECRET = 'portal-secret';
  });

  it('tests the connection and lists users without returning secrets', async () => {
    granted = new Set([`${SETTINGS_CASDOOR}:read`]);
    const connected = await send('POST', '/admin/casdoor/testConnection');
    expect(connected.status).toBe(200);
    const connection = (await connected.json()) as {
      data: { ok: boolean; organization: string };
    };
    expect(connection.data).toMatchObject({
      ok: true,
      organization: 'smartcore',
      auth: 'query',
    });
    expect(JSON.stringify(connection)).not.toContain('portal-secret');
    const users = await send('GET', '/admin/casdoor/users?q=ali');
    expect(users.status).toBe(200);
    const listed = (await users.json()) as {
      data: { id: string; password?: string }[];
      meta: { total: number };
    };
    expect(listed.data).toEqual([
      expect.objectContaining({ id: 'smartcore/alice', name: 'alice' }),
    ]);
    expect(listed.data[0]?.password).toBeUndefined();
    expect(listed.meta.total).toBe(1);
    expect(JSON.stringify(listed)).not.toContain('hash');
    const groups = await send('GET', '/admin/casdoor/groups');
    expect(groups.status).toBe(200);
    const groupPayload = (await groups.json()) as {
      data: { id: string; displayName: string; parentId: string }[];
      meta: { total: number };
    };
    expect(groupPayload.data).toEqual([
      expect.objectContaining({
        id: 'smartcore/IT',
        displayName: 'IT中心',
        parentId: '芯智控股',
      }),
    ]);
    expect(groupPayload.meta.total).toBe(1);
  });
});
