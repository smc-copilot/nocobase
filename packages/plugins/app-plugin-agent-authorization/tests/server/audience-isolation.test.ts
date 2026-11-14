import { createHash, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgentAuthorizationServices } from '../../server/services/index.js';
import {
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

const APP_A = 'http://app-a';
const APP_B = 'http://app-b';

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function servicesFor(harness: AgentAuthHarness, audience: string) {
  return createAgentAuthorizationServices({
    database: () => harness.database,
    config: () => ({ audience }),
    defaultAudience: () => audience,
  });
}

/**
 * A17: two authorization services share one database and differ only by audience.
 * A token stamped for A must not resolve under B, and B must not reuse A's grant.
 */
describe('dual app audience isolation', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('rejects audience A tokens and grants under audience B', async () => {
    harness = await createAgentAuthHarness();
    const servicesA = servicesFor(harness, APP_A);
    const servicesB = servicesFor(harness, APP_B);
    const userId = await harness.createLocalUser('split@example.com');
    const client = await servicesA.clients.create({
      name: 'Shared client',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit', 'business-ui:view'],
    });
    const grantA = await servicesA.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: APP_A,
      scopes: ['business-ui:edit'],
    });
    const { verifier, challenge } = pkce();
    const redirectUri = 'http://localhost:8090/cb';
    const code = await servicesA.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grantA.id,
      redirectUri,
      codeChallenge: challenge,
      scope: 'business-ui:edit',
    });
    const tokens = await servicesA.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code,
      redirectUri,
      codeVerifier: verifier,
    });

    expect(
      await servicesA.oauth.resolveAccessToken(tokens.access_token),
    ).toMatchObject({
      audience: APP_A,
      grantId: grantA.id,
      userId,
    });
    expect(
      await servicesB.oauth.resolveAccessToken(tokens.access_token),
    ).toBeUndefined();

    const usableOnB = await servicesB.grants.requireUsable(grantA.id);
    expect(usableOnB.grant.audience).toBe(APP_A);
    expect(usableOnB.grant.audience).not.toBe(servicesB.config().audience);
    expect(
      await servicesB.grants.findActiveCovering({
        clientId: client.clientId,
        localUserId: userId,
        audience: APP_B,
        scopes: ['business-ui:edit'],
      }),
    ).toBeUndefined();

    const grantB = await servicesB.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: APP_B,
      scopes: ['business-ui:edit'],
    });
    expect(grantB.id).not.toBe(grantA.id);
    expect(grantB.audience).toBe(APP_B);

    const pair = pkce();
    const codeB = await servicesB.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grantB.id,
      redirectUri,
      codeChallenge: pair.challenge,
      scope: 'business-ui:edit',
    });
    const tokensB = await servicesB.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code: codeB,
      redirectUri,
      codeVerifier: pair.verifier,
    });
    expect(
      await servicesB.oauth.resolveAccessToken(tokensB.access_token),
    ).toMatchObject({ audience: APP_B, grantId: grantB.id });
    expect(
      await servicesA.oauth.resolveAccessToken(tokensB.access_token),
    ).toBeUndefined();
    expect(
      await servicesA.oauth.resolveAccessToken(tokens.access_token),
    ).toMatchObject({ audience: APP_A, grantId: grantA.id });
  });
});
