import { createHash, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AUDIENCE,
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function tokensFor(
  harness: AgentAuthHarness,
  input: {
    readonly userId: string;
    readonly clientId: string;
    readonly grantId: string;
    readonly scope: string;
  },
) {
  const { verifier, challenge } = pkce();
  const redirectUri = 'http://localhost:8090/cb';
  const code = await harness.services.oauth.createAuthorizationCode({
    clientId: input.clientId,
    localUserId: input.userId,
    grantId: input.grantId,
    redirectUri,
    codeChallenge: challenge,
    scope: input.scope,
  });
  return harness.services.oauth.exchangeAuthorizationCode({
    clientId: input.clientId,
    code,
    redirectUri,
    codeVerifier: verifier,
  });
}

describe('client disable and disabled-user issuance', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('revokes only the disabled client and keeps a re-enabled client on new codes', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('life@example.com');
    const clientA = await harness.services.clients.create({
      name: 'A',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit', 'business-ui:view'],
    });
    const clientB = await harness.services.clients.create({
      name: 'B',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:view'],
    });
    const grantA = await harness.services.grants.createOrReuse({
      clientId: clientA.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const grantB = await harness.services.grants.createOrReuse({
      clientId: clientB.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const tokensA = await tokensFor(harness, {
      userId,
      clientId: clientA.clientId,
      grantId: grantA.id,
      scope: 'business-ui:edit',
    });
    const tokensB = await tokensFor(harness, {
      userId,
      clientId: clientB.clientId,
      grantId: grantB.id,
      scope: 'business-ui:view',
    });

    await harness.services.clients.update(clientA.clientId, { enabled: false });
    expect(
      await harness.services.oauth.resolveAccessToken(tokensA.access_token),
    ).toBeUndefined();
    expect(
      await harness.services.oauth.resolveAccessToken(tokensB.access_token),
    ).toMatchObject({ clientId: clientB.clientId, userId });
    await expect(
      harness.services.oauth.refresh({
        clientId: clientA.clientId,
        refreshToken: tokensA.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const local = await harness.auth.signInUser(
      userId,
      new Request('http://localhost/login', { method: 'POST' }),
    );
    expect(local.ok).toBe(true);

    await harness.services.clients.update(clientA.clientId, { enabled: true });
    expect(
      await harness.services.oauth.resolveAccessToken(tokensA.access_token),
    ).toBeUndefined();
    const renewed = await tokensFor(harness, {
      userId,
      clientId: clientA.clientId,
      grantId: grantA.id,
      scope: 'business-ui:edit',
    });
    expect(
      await harness.services.oauth.resolveAccessToken(renewed.access_token),
    ).toMatchObject({ clientId: clientA.clientId, grantId: grantA.id });
    expect(
      await harness.services.oauth.resolveAccessToken(tokensB.access_token),
    ).toMatchObject({ clientId: clientB.clientId });
  });

  it('refuses code exchange and refresh for a disabled user until the user is enabled', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('frozen@example.com');
    const client = await harness.services.clients.create({
      name: 'A',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const tokens = await tokensFor(harness, {
      userId,
      clientId: client.clientId,
      grantId: grant.id,
      scope: 'business-ui:edit',
    });

    await harness.users.disable(userId);
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const { verifier, challenge } = pkce();
    const redirectUri = 'http://localhost:8090/cb';
    const code = await harness.services.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grant.id,
      redirectUri,
      codeChallenge: challenge,
      scope: 'business-ui:edit',
    });
    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code,
        redirectUri,
        codeVerifier: verifier,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    await harness.users.enable(userId);
    const exchanged = await harness.services.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    expect(exchanged.access_token.startsWith('agt_a_')).toBe(true);
    const refreshed = await harness.services.oauth.refresh({
      clientId: client.clientId,
      refreshToken: tokens.refresh_token,
    });
    expect(refreshed.scope).toBe('business-ui:edit');
  });
});
