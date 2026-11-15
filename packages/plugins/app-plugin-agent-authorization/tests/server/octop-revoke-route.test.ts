import { createHash, randomBytes } from 'node:crypto';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { createOAuthRouter } from '../../server/routes/oauth.js';
import {
  AUDIENCE,
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

/**
 * Protocol integration: the form body Octop builds for client_secret_post
 * revoke (token + client_id + client_secret) against the real NocoBase route.
 */
function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function issueTokens(harness: AgentAuthHarness) {
  const userId = await harness.createLocalUser('octop-revoke@example.com');
  const client = await harness.services.clients.create({
    name: 'Octop Revoke',
    redirectUris: ['http://localhost:8090/cb'],
    allowedScopes: ['business-ui:edit'],
  });
  const grant = await harness.services.grants.createOrReuse({
    clientId: client.clientId,
    localUserId: userId,
    audience: AUDIENCE,
    scopes: ['business-ui:edit'],
  });
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
  const tokens = await harness.services.oauth.exchangeAuthorizationCode({
    clientId: client.clientId,
    code,
    redirectUri,
    codeVerifier: verifier,
  });
  return { client, tokens };
}

function revokeApp(harness: AgentAuthHarness) {
  const router = createOAuthRouter({
    services: () => harness.services,
    authenticate: async (_context, next) => next(),
    optionalAuthenticate: async (_context, next) => next(),
    defaultAudience: () => AUDIENCE,
    publicBasePath: () => '',
  });
  return new Hono().route('/agentAuthorization', router);
}

/** Same fields Octop `_remote_revoke_tokens` sends for client_secret_post. */
function octopRevokeBody(
  token: string,
  clientId: string,
  clientSecret: string,
): string {
  return new URLSearchParams({
    token,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();
}

describe('Octop-shaped OAuth revoke against NocoBase route', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('revokes access and refresh with client_secret_post form body', async () => {
    harness = await createAgentAuthHarness();
    const { client, tokens } = await issueTokens(harness);
    const app = revokeApp(harness);

    for (const token of [tokens.access_token, tokens.refresh_token]) {
      const response = await app.request('/agentAuthorization/oauth/revoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: octopRevokeBody(token, client.clientId, client.clientSecret),
      });
      expect(response.status).toBe(200);
    }

    expect(
      await harness.services.oauth.resolveAccessToken(tokens.access_token),
    ).toBeUndefined();
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
  });

  it('rejects a wrong secret with 401 and leaves tokens usable', async () => {
    harness = await createAgentAuthHarness();
    const { client, tokens } = await issueTokens(harness);
    const app = revokeApp(harness);

    const response = await app.request('/agentAuthorization/oauth/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: octopRevokeBody(
        tokens.access_token,
        client.clientId,
        'not-the-real-secret',
      ),
    });
    expect(response.status).toBe(401);

    expect(
      await harness.services.oauth.resolveAccessToken(tokens.access_token),
    ).toMatchObject({ clientId: client.clientId });
    const refreshed = await harness.services.oauth.refresh({
      clientId: client.clientId,
      refreshToken: tokens.refresh_token,
    });
    expect(refreshed.access_token.startsWith('agt_a_')).toBe(true);
  });

  it('rejects revoke without client authentication', async () => {
    harness = await createAgentAuthHarness();
    const { tokens } = await issueTokens(harness);
    const app = revokeApp(harness);

    const response = await app.request('/agentAuthorization/oauth/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: tokens.access_token }).toString(),
    });
    expect(response.status).toBe(401);
  });
});
