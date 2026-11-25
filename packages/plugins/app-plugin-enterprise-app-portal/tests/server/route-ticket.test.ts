import { generateKeyPair, exportPKCS8 } from 'jose';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  DEFAULT_ROUTE_AUDIENCE,
  DEFAULT_ROUTE_ISSUER,
  PORTAL_ROUTE_REDEEM_TOKEN_ENV,
  PORTAL_ROUTE_SIGNING_KEY_ENV,
} from '../../server/config.js';
import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

const OCTOP = {
  appCode: 'octop',
  name: 'Octop',
  appType: 'octop' as const,
  baseUrl: 'https://example.com/apps/octop',
  targetPath: '/',
  healthUrl: 'https://example.com/',
  casdoorAppKey: 'octop-app',
};

describe('route tickets', () => {
  let harness: PortalHarness;
  let privatePem: string;
  const redeemToken = 'test-redeem-token';

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('EdDSA', {
      extractable: true,
    });
    privatePem = await exportPKCS8(privateKey);
    harness = await createPortalHarness(
      {
        launchHostAllowlist: ['example.com'],
        access: {
          source: 'contractFixture',
          fixtureGrants: [{ userId: 'user-1', appCodes: ['octop'] }],
        },
        routing: {
          enabled: true,
          publicRouterEntryUrl: 'https://ai.superice.com:8090/api/entry',
          issuer: DEFAULT_ROUTE_ISSUER,
          audience: DEFAULT_ROUTE_AUDIENCE,
          ticketTtlSeconds: 30,
          signingKeyEnv: PORTAL_ROUTE_SIGNING_KEY_ENV,
          redeemServiceCredentialEnv: PORTAL_ROUTE_REDEEM_TOKEN_ENV,
          requireBinding: true,
          recheckEnforceOnRedeem: true,
        },
      },
      {
        env: {
          [PORTAL_ROUTE_SIGNING_KEY_ENV]: privatePem,
          [PORTAL_ROUTE_REDEEM_TOKEN_ENV]: redeemToken,
        },
      },
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
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
    vi.restoreAllMocks();
    vi.spyOn(harness.services.subjects, 'requireForUser').mockResolvedValue({
      providerIssuer: 'https://casdoor.example',
      providerSubject: 'smartcore/alice',
      casdoorUserId: 'smartcore/alice',
      localUserId: 'user-1',
    });
  });

  it('issues a ticket and redeems it once', async () => {
    await harness.services.catalog.create(OCTOP, 'admin-1');
    await harness.services.preferences.upsert('user-1', {
      autoLaunchMode: 'if_single',
      defaultAppCode: null,
    });
    const issued = await harness.services.routeTickets.issue(
      { userId: 'user-1', username: 'alice' },
      { appCode: 'octop', mode: 'auto' },
    );
    expect(issued.appCode).toBe('octop');
    expect(issued.submission.url).toContain('/api/entry');
    expect(issued.ticket.split('.')).toHaveLength(3);

    harness.services.routeTickets.assertRedeemCredential(
      `Bearer ${redeemToken}`,
    );
    const redeemed = await harness.services.routeTickets.redeem({
      ticket: issued.ticket,
    });
    expect(redeemed).toMatchObject({
      appCode: 'octop',
      publicUrl: 'https://example.com/apps/octop/',
      casdoorSubject: 'smartcore/alice',
      consumed: true,
    });

    await expect(
      harness.services.routeTickets.redeem({ ticket: issued.ticket }),
    ).rejects.toMatchObject({ reason: 'TICKET_REPLAYED' });

    const audit = JSON.stringify(await harness.services.audit.list());
    expect(audit).not.toMatch(/BEGIN (PRIVATE|PUBLIC) KEY/u);
    expect(audit).not.toContain(issued.ticket);
    expect(audit).not.toContain(redeemToken);
  });

  it('rejects forged app selection and bad redeem credentials', async () => {
    await harness.services.catalog.create(OCTOP, 'admin-1');
    await expect(
      harness.services.routeTickets.issue(
        { userId: 'user-1' },
        { appCode: 'other', mode: 'selected' },
      ),
    ).rejects.toMatchObject({ reason: 'APP_ACCESS_DENIED' });

    expect(() =>
      harness.services.routeTickets.assertRedeemCredential('Bearer wrong'),
    ).toThrow();
  });

  it('denies redeem after access is revoked', async () => {
    await harness.services.catalog.create(OCTOP, 'admin-1');
    const issued = await harness.services.routeTickets.issue(
      { userId: 'user-1' },
      { appCode: 'octop', mode: 'selected' },
    );
    harness.config.current = {
      ...harness.config.current,
      access: {
        source: 'contractFixture',
        fixtureGrants: [{ userId: 'user-1', appCodes: [] }],
      },
    };
    harness.services.access.clearCache();
    await expect(
      harness.services.routeTickets.redeem({ ticket: issued.ticket }),
    ).rejects.toMatchObject({ reason: 'APP_ACCESS_DENIED' });
  });
});
