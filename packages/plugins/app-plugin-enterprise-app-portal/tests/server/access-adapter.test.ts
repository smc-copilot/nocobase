import { describe, expect, it } from 'vitest';

import { ApiError } from '@nocobase/app-server/router';

import { CasdoorApplicationAccessAdapter } from '../../server/services/casdoor-application-access.js';

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
});
