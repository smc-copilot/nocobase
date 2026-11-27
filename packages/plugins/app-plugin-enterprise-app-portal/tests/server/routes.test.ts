import type { MiddlewareHandler } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  findUndeclaredApiRoutes,
  type AppApiRouter,
} from '@nocobase/app-server/router';

import { SETTINGS_AUDIT, SETTINGS_CATALOG } from '../../server/config.js';
import { createPortalRouter } from '../../server/routes/portal.js';
import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

describe('enterprise app portal routes', () => {
  let harness: PortalHarness;
  let granted: Set<string>;
  let signedIn: boolean;
  let router: ReturnType<typeof createPortalRouter>;

  beforeAll(async () => {
    harness = await createPortalHarness();
    const authenticate: MiddlewareHandler = async (context, next) => {
      if (!signedIn) {
        return context.json(
          {
            error: {
              code: 401,
              status: 'UNAUTHENTICATED',
              reason: 'AUTH_REQUIRED',
            },
          },
          401,
        );
      }
      context.set('auth', {
        user: { id: 'user-1', username: '10001' },
      } as never);
      await next();
    };
    router = createPortalRouter({
      services: () => harness.services,
      authenticate: [authenticate],
      authorize: (_context, item, action) =>
        Promise.resolve(granted.has(`${item}:${action}`)),
    });
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    signedIn = true;
    granted = new Set();
    const { query } = harness.database.connection();
    for (const table of [
      'enterprisePortalRouteTickets',
      'enterprisePortalAuditEvents',
      'enterprisePortalUserPreferences',
      'enterprisePortalApplications',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    harness.services.access.clearCache();
    harness.services.health.clearCache();
  });

  const send = (method: string, path: string, body?: unknown) =>
    router.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('declares every route', () => {
    expect(findUndeclaredApiRoutes(router as unknown as AppApiRouter)).toEqual(
      [],
    );
  });

  it('refuses catalog writes without the settings grant', async () => {
    const response = await send('POST', '/admin/applications', {
      appCode: 'octop',
      name: 'Octop',
      appType: 'octop',
      baseUrl: 'https://example.com/apps/octop',
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: { reason: string };
    };
    expect(payload.error.reason).toBe('PORTAL_ADMIN_FORBIDDEN');
  });

  it('creates a catalog row, lists authorized cards and launches', async () => {
    granted.add(`${SETTINGS_CATALOG}:configure`);
    granted.add(`${SETTINGS_CATALOG}:read`);
    granted.add(`${SETTINGS_AUDIT}:read`);
    const created = await send('POST', '/admin/applications', {
      appCode: 'octop',
      name: 'Octop',
      appType: 'octop',
      baseUrl: 'https://example.com/apps/octop',
      healthUrl: 'https://example.com/',
    });
    expect(created.status).toBe(200);
    const list = await send('GET', '/applications');
    expect(list.status).toBe(200);
    const catalog = (await list.json()) as {
      data: { applications: { appCode: string }[]; isolationNotice: boolean };
    };
    expect(catalog.data.applications).toEqual([
      expect.objectContaining({ appCode: 'octop' }),
    ]);
    expect(catalog.data.isolationNotice).toBe(true);
    const launched = await send('POST', '/applications/octop/launch');
    expect(launched.status).toBe(200);
    const body = (await launched.json()) as { data: { url: string } };
    expect(body.data.url).toMatch(/^https:\/\/example.com\//);
    const audit = await send('GET', '/admin/auditEvents');
    expect(audit.status).toBe(200);
  });

  it('answers 401 without a session', async () => {
    signedIn = false;
    const response = await send('GET', '/applications');
    expect(response.status).toBe(401);
  });

  it('refuses Casdoor admin routes without the settings grant', async () => {
    const response = await send('POST', '/admin/casdoor/testConnection');
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { reason: string } };
    expect(payload.error.reason).toBe('PORTAL_ADMIN_FORBIDDEN');
  });
});
