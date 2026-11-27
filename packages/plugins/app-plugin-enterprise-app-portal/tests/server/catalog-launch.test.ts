import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@nocobase/app-server/router';

import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

const OCTOP = {
  appCode: 'octop',
  name: 'Octop',
  appType: 'octop' as const,
  baseUrl: 'https://example.com/apps/octop',
  targetPath: '/',
  healthUrl: 'https://example.com/',
};

describe('catalog, launch, preferences and audit', () => {
  let harness: PortalHarness;

  beforeAll(async () => {
    harness = await createPortalHarness();
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'enterprisePortalAuditEvents',
      'enterprisePortalUserPreferences',
      'enterprisePortalApplications',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    harness.services.access.clearCache();
    harness.services.health.clearCache();
  });

  it('creates a catalog entry only on the allowlist and never treats catalog as access', async () => {
    const created = await harness.services.catalog.create(OCTOP, 'admin-1');
    expect(created.appCode).toBe('octop');
    await expect(
      harness.services.catalog.create(
        {
          ...OCTOP,
          appCode: 'evil',
          baseUrl: 'https://evil.example.net/app',
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'HOST_NOT_ALLOWLISTED' });
    const listed = await harness.services.launch.listAuthorized({
      userId: 'user-1',
    });
    expect(listed.applications.map((row) => row.appCode)).toEqual(['octop']);
    expect(listed.isolationNotice).toBe(true);
    const denied = await harness.services.launch.listAuthorized({
      userId: 'stranger',
    });
    expect(denied.applications).toEqual([]);
  });

  it('relaunches only after access, enabled and health rechecks', async () => {
    await harness.services.catalog.create(OCTOP, 'admin-1');
    const launched = await harness.services.launch.launch(
      { userId: 'user-1' },
      'octop',
    );
    expect(launched.url).toBe('https://example.com/apps/octop/');
    await expect(
      harness.services.launch.launch({ userId: 'stranger' }, 'octop'),
    ).rejects.toMatchObject({ reason: 'APP_ACCESS_DENIED' });
    await harness.services.catalog.update(
      'octop',
      { enabled: false },
      'admin-1',
    );
    await expect(
      harness.services.launch.launch({ userId: 'user-1' }, 'octop'),
    ).rejects.toMatchObject({ reason: 'APP_DISABLED' });
    const events = await harness.services.audit.list();
    expect(events.some((event) => event.action === 'launch')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/secret|token|password/i);
  });

  it('stores autoLaunch preferences without expanding access', async () => {
    await harness.services.catalog.create(OCTOP, 'admin-1');
    await harness.services.catalog.create(
      {
        appCode: 'weknora',
        name: 'Weknora',
        appType: 'weknora',
        baseUrl: 'https://example.com/apps/weknora',
      },
      'admin-1',
    );
    await harness.services.preferences.upsert('user-1', {
      autoLaunchMode: 'default_if_valid',
      defaultAppCode: 'octop',
    });
    const listed = await harness.services.launch.listAuthorized({
      userId: 'user-1',
    });
    expect(listed.suggestedAppCode).toBe('octop');
    expect(listed.applications.find((row) => row.isDefault)?.appCode).toBe(
      'octop',
    );
  });

  it('fails closed when the access source is unconfigured', async () => {
    harness.config.current = {
      ...harness.config.current,
      access: { source: 'unconfigured' },
    };
    await harness.services.catalog.create(OCTOP, 'admin-1');
    await expect(
      harness.services.launch.listAuthorized({ userId: 'user-1' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
