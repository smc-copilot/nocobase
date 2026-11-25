import { describe, expect, it } from 'vitest';

import { ApiError } from '@nocobase/app-server/router';

import { CasdoorApplicationAccessAdapter } from '../../server/services/casdoor-application-access.js';
import { CasdoorManagementClient } from '../../server/services/casdoor-management-client.js';

describe('CasdoorApplicationAccessAdapter', () => {
  it('fails closed when unconfigured', async () => {
    const adapter = new CasdoorApplicationAccessAdapter(() => ({}));
    await expect(
      adapter.listAuthorizedAppKeys({ userId: 'u1' }),
    ).rejects.toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'CASDOOR_AUTHORIZATION_UNAVAILABLE',
    });
    expect.assertions(1);
  });

  it('refuses an unverified managementApi source', async () => {
    const adapter = new CasdoorApplicationAccessAdapter(() => ({
      source: 'managementApi',
      managementApi: {
        endpoint: 'https://casdoor.example/api',
      },
    }));
    await expect(
      adapter.listAuthorizedAppKeys({ userId: 'u1' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('reads isolation fixture grants by userId and username', async () => {
    const adapter = new CasdoorApplicationAccessAdapter(() => ({
      source: 'contractFixture',
      fixtureGrants: [
        { userId: 'u1', appCodes: ['octop'] },
        { username: '10001', appCodes: ['weknora'] },
      ],
    }));
    expect(
      (await adapter.listAuthorizedAppKeys({ userId: 'u1' })).appKeys,
    ).toEqual(['octop']);
    expect(
      (
        await adapter.listAuthorizedAppKeys({
          userId: 'u2',
          username: '10001',
        })
      ).appKeys,
    ).toEqual(['weknora']);
    expect(
      (await adapter.listAuthorizedAppKeys({ userId: 'nobody' })).appKeys,
    ).toEqual([]);
  });

  it('maps verified claims only when they are fresh', async () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const adapter = new CasdoorApplicationAccessAdapter(
      () => ({
        source: 'verifiedClaims',
        claimPath: 'groups',
        groupToApp: { knowledge: 'octop' },
      }),
      () => now,
    );
    await expect(
      adapter.listAuthorizedAppKeys({
        userId: 'u1',
        claims: { groups: ['knowledge'] },
      }),
    ).rejects.toMatchObject({ reason: 'CASDOOR_AUTHORIZATION_UNAVAILABLE' });
    const keys = await adapter.listAuthorizedAppKeys({
      userId: 'u1',
      claims: { groups: ['knowledge'] },
      claimsObservedAt: now,
    });
    expect(keys.appKeys).toEqual(['octop']);
  });

  it('enforces namespaced permissions and fails closed on Casdoor errors', async () => {
    const hits: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      hits.push(url.pathname);
      const body = JSON.parse(String(init?.body)) as string[];
      if (body[1] === 'octop') {
        return Response.json({ status: 'ok', data: [true] });
      }
      if (body[1] === 'weknora') {
        return Response.json({ status: 'ok', data: [false] });
      }
      return Response.json({
        status: 'error',
        msg: 'The permission does not exist',
      });
    };
    const adapter = new CasdoorApplicationAccessAdapter(
      () => ({ source: 'managementApi' }),
      () => new Date('2026-11-21T00:00:00Z'),
      {
        client: () =>
          new CasdoorManagementClient(
            {
              endpoint: 'https://casdoor.test',
              clientId: 'portal-client',
              clientSecret: 'portal-secret',
              organization: 'smartcore',
              applicationOwner: 'admin',
              permissionOwner: 'smartcore',
              auth: 'query',
              permissionNamePrefix: 'nocobase-portal-app-',
            },
            fetchImpl,
          ),
        targets: async () => [
          { appCode: 'octop', casdoorAppKey: 'octop' },
          { appCode: 'weknora', casdoorAppKey: null },
          { appCode: 'missing', casdoorAppKey: 'missing' },
        ],
      },
    );
    const decision = await adapter.listAuthorizedAppKeys({
      userId: 'local-1',
      username: 'alice',
    });
    expect(decision).toEqual({ appKeys: ['octop'], source: 'managementApi' });
    expect(hits).toEqual(['/api/enforce', '/api/enforce', '/api/enforce']);
    const again = await adapter.listAuthorizedAppKeys({
      userId: 'local-1',
      username: 'alice',
    });
    expect(again.appKeys).toEqual(['octop']);
    expect(hits).toHaveLength(3);

    const failing: typeof fetch = async () =>
      new Response('down', { status: 503 });
    const uncached = new CasdoorApplicationAccessAdapter(
      () => ({ source: 'managementApi' }),
      () => new Date('2026-11-21T00:00:00Z'),
      {
        client: () =>
          new CasdoorManagementClient(
            {
              endpoint: 'https://casdoor.test',
              clientId: 'portal-client',
              clientSecret: 'portal-secret',
              organization: 'smartcore',
              applicationOwner: 'admin',
              permissionOwner: 'smartcore',
              auth: 'query',
              permissionNamePrefix: 'nocobase-portal-app-',
            },
            failing,
          ),
        targets: async () => [{ appCode: 'octop', casdoorAppKey: 'octop' }],
      },
    );
    await expect(
      uncached.listAuthorizedAppKeys({ userId: 'local-1', username: 'alice' }),
    ).rejects.toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'CASDOOR_AUTHORIZATION_UNAVAILABLE',
    });
    await expect(
      uncached.listAuthorizedAppKeys({ userId: 'local-1', username: 'alice' }),
    ).rejects.toMatchObject({ reason: 'CASDOOR_AUTHORIZATION_UNAVAILABLE' });
  });

  it('prefers casdoorUserId and supports bypassCache / requireBinding', async () => {
    const subjects: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as string[];
      subjects.push(body[0] ?? '');
      return Response.json({ status: 'ok', data: [true] });
    };
    const adapter = new CasdoorApplicationAccessAdapter(
      () => ({ source: 'managementApi', cacheTtlMs: 60_000 }),
      () => new Date('2026-11-21T00:00:00Z'),
      {
        client: () =>
          new CasdoorManagementClient(
            {
              endpoint: 'https://casdoor.test',
              clientId: 'portal-client',
              clientSecret: 'portal-secret',
              organization: 'smartcore',
              applicationOwner: 'admin',
              permissionOwner: 'smartcore',
              auth: 'query',
              permissionNamePrefix: 'nocobase-portal-app-',
            },
            fetchImpl,
          ),
        targets: async () => [{ appCode: 'octop', casdoorAppKey: 'octop' }],
      },
    );
    await adapter.listAuthorizedAppKeys({
      userId: 'local-1',
      casdoorUserId: 'smartcore/bound',
      username: 'alice',
    });
    expect(subjects).toEqual(['smartcore/bound']);
    await adapter.listAuthorizedAppKeys({
      userId: 'local-1',
      casdoorUserId: 'smartcore/bound',
    });
    expect(subjects).toHaveLength(1);
    await adapter.listAuthorizedAppKeys(
      { userId: 'local-1', casdoorUserId: 'smartcore/bound' },
      { bypassCache: true },
    );
    expect(subjects).toHaveLength(2);
    adapter.clearCache();
    await expect(
      adapter.listAuthorizedAppKeys(
        { userId: 'local-1', username: 'alice' },
        { requireBinding: true, bypassCache: true },
      ),
    ).rejects.toMatchObject({ reason: 'IDENTITY_BINDING_REQUIRED' });
  });
});
