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

describe('agent oauth flow (A03/A05/A06/A07)', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('exchanges code with PKCE, refreshes without expanding scope, and rejects replays', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('oauth@example.com');
    const client = await harness.services.clients.create({
      name: 'Octop',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit', 'business-ui:view'],
    });
    const { verifier, challenge } = pkce();
    const redirectUri = 'http://localhost:8090/cb';
    const scopes = ['business-ui:edit'] as const;

    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes,
    });
    const code = await harness.services.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grant.id,
      redirectUri,
      codeChallenge: challenge,
      scope: scopes.join(' '),
    });

    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code,
        redirectUri,
        codeVerifier: 'wrong-verifier-value-pad-pad-pad-pad',
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const tokens = await harness.services.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    expect(tokens.access_token.startsWith('agt_a_')).toBe(true);
    expect(tokens.refresh_token.startsWith('agt_r_')).toBe(true);
    expect(tokens.scope).toBe('business-ui:edit');

    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code,
        redirectUri,
        codeVerifier: verifier,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const refreshed = await harness.services.oauth.refresh({
      clientId: client.clientId,
      refreshToken: tokens.refresh_token,
    });
    expect(refreshed.scope).toBe('business-ui:edit');
    expect(refreshed.access_token).not.toBe(tokens.access_token);

    await harness.services.clients.authenticate(
      client.clientId,
      client.clientSecret,
    );
    await harness.services.oauth.revoke({
      clientId: client.clientId,
      token: refreshed.access_token,
    });
    expect(
      await harness.services.oauth.resolveAccessToken(refreshed.access_token),
    ).toBeUndefined();
  });

  it('rejects wrong client secret on authenticate', async () => {
    harness = await createAgentAuthHarness();
    const client = await harness.services.clients.create({
      name: 'Agent',
      redirectUris: ['http://localhost:1/cb'],
      allowedScopes: ['business-ui:view'],
    });
    await expect(
      harness.services.clients.authenticate(client.clientId, 'not-the-secret'),
    ).rejects.toMatchObject({ reason: 'INVALID_CLIENT' });
  });
});
