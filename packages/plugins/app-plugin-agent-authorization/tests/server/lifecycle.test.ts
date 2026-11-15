import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { executeIdempotentMutation } from '@nocobase/app-server/router';
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
    const pending = pkce();
    const redirectUri = 'http://localhost:8090/cb';
    const staleCode = await harness.services.oauth.createAuthorizationCode({
      clientId: clientA.clientId,
      localUserId: userId,
      grantId: grantA.id,
      redirectUri,
      codeChallenge: pending.challenge,
      scope: 'business-ui:edit',
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
    await expect(
      harness.services.oauth.refresh({
        clientId: clientA.clientId,
        refreshToken: tokensA.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: clientA.clientId,
        code: staleCode,
        redirectUri,
        codeVerifier: pending.verifier,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
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

  it('revokes through an outer disable transaction without pool timeout', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('tx-disable@example.com');
    const otherId = await harness.createLocalUser('tx-other@example.com');
    const client = await harness.services.clients.create({
      name: 'Tx',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const otherGrant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: otherId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const tokens = await tokensFor(harness, {
      userId,
      clientId: client.clientId,
      grantId: grant.id,
      scope: 'business-ui:edit',
    });
    const otherTokens = await tokensFor(harness, {
      userId: otherId,
      clientId: client.clientId,
      grantId: otherGrant.id,
      scope: 'business-ui:edit',
    });

    const started = Date.now();
    // Same shape as UserManagementService.disable: outer transaction, then
    // users.withConnection(connection).disable which runs the critical hook.
    await harness.database.connection().transaction(async (connection) => {
      await harness.users.withConnection(connection).disable(userId);
    });
    expect(Date.now() - started).toBeLessThan(5_000);

    const after = await harness.services.grants
      .requireUsable(grant.id)
      .catch((error: { reason?: string }) => error);
    expect(after).toMatchObject({ reason: 'INVALID_GRANT' });
    const bumped = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(bumped.credentialEpoch)).toBeGreaterThan(1);

    expect(
      await harness.services.oauth.resolveAccessToken(tokens.access_token),
    ).toBeUndefined();
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
    expect(
      await harness.services.oauth.resolveAccessToken(otherTokens.access_token),
    ).toMatchObject({ userId: otherId });

    await harness.users.enable(userId);
    expect(
      await harness.services.oauth.resolveAccessToken(tokens.access_token),
    ).toBeUndefined();
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const renewed = await tokensFor(harness, {
      userId,
      clientId: client.clientId,
      grantId: grant.id,
      scope: 'business-ui:edit',
    });
    expect(
      await harness.services.oauth.resolveAccessToken(renewed.access_token),
    ).toMatchObject({ userId, grantId: grant.id });
  });

  it('rolls back disable when a critical revoke fails inside the transaction', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('tx-fail@example.com');
    const client = await harness.services.clients.create({
      name: 'Fail',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const before = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();

    harness.users.addOnUserDisabled(
      async () => {
        throw new Error('simulated revoke failure');
      },
      { critical: true },
    );

    await expect(
      harness.database.connection().transaction(async (connection) => {
        await harness.users.withConnection(connection).disable(userId);
      }),
    ).rejects.toThrow('simulated revoke failure');

    const user = await harness.users.get(userId);
    expect(user?.disabledAt).toBeNull();
    const after = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(after.credentialEpoch)).toBe(Number(before.credentialEpoch));
  });

  it('revokes credentials on disable and does not revive them after enable', async () => {
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

    const pending = pkce();
    const redirectUri = 'http://localhost:8090/cb';
    const staleCode = await harness.services.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grant.id,
      redirectUri,
      codeChallenge: pending.challenge,
      scope: 'business-ui:edit',
    });

    await harness.users.disable(userId);
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
    await expect(
      harness.services.oauth.createAuthorizationCode({
        clientId: client.clientId,
        localUserId: userId,
        grantId: grant.id,
        redirectUri,
        codeChallenge: pending.challenge,
        scope: 'business-ui:edit',
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code: staleCode,
        redirectUri,
        codeVerifier: pending.verifier,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    await harness.users.enable(userId);
    expect(
      await harness.services.oauth.resolveAccessToken(tokens.access_token),
    ).toBeUndefined();
    await expect(
      harness.services.oauth.refresh({
        clientId: client.clientId,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });
    await expect(
      harness.services.oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code: staleCode,
        redirectUri,
        codeVerifier: pending.verifier,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const fresh = pkce();
    const code = await harness.services.oauth.createAuthorizationCode({
      clientId: client.clientId,
      localUserId: userId,
      grantId: grant.id,
      redirectUri,
      codeChallenge: fresh.challenge,
      scope: 'business-ui:edit',
    });
    const exchanged = await harness.services.oauth.exchangeAuthorizationCode({
      clientId: client.clientId,
      code,
      redirectUri,
      codeVerifier: fresh.verifier,
    });
    expect(exchanged.access_token.startsWith('agt_a_')).toBe(true);
    const refreshed = await harness.services.oauth.refresh({
      clientId: client.clientId,
      refreshToken: exchanged.refresh_token,
    });
    expect(refreshed.scope).toBe('business-ui:edit');
  });

  it('replays a successful disable Idempotency-Key without bumping epoch again', async () => {
    harness = await createAgentAuthHarness();
    await harness.database
      .connection()
      .builder.createCollection('mutationReceipts', (collection) => {
        collection.string('id', { length: 64 }).primary();
        collection.string('digest', { length: 64 }).notNull();
        collection.json('result').nullable();
        collection.datetime('expiresAt').notNull();
      });

    const userId = await harness.createLocalUser('idem-disable@example.com');
    const client = await harness.services.clients.create({
      name: 'Idem',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const before = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();

    const key = `${Date.now()}.${randomUUID()}`;
    const run = () =>
      executeIdempotentMutation({
        connection: harness.database.connection(),
        key,
        principal: 'admin-1',
        operation: `POST /users/${userId}/disable`,
        input: null,
        authorize: () => undefined,
        authorizeReplay: () => undefined,
        execute: (transaction) =>
          harness.users.withConnection(transaction).disable(userId),
      });

    const first = await run();
    expect(first.replayed).toBe(false);
    const afterFirst = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(afterFirst.credentialEpoch)).toBe(
      Number(before.credentialEpoch) + 1,
    );

    const second = await run();
    expect(second.replayed).toBe(true);
    const afterReplay = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(afterReplay.credentialEpoch)).toBe(
      Number(afterFirst.credentialEpoch),
    );
  });

  it('lets the same Idempotency-Key retry after a critical disable failure', async () => {
    harness = await createAgentAuthHarness();
    await harness.database
      .connection()
      .builder.createCollection('mutationReceipts', (collection) => {
        collection.string('id', { length: 64 }).primary();
        collection.string('digest', { length: 64 }).notNull();
        collection.json('result').nullable();
        collection.datetime('expiresAt').notNull();
      });

    const userId = await harness.createLocalUser('idem-fail@example.com');
    const client = await harness.services.clients.create({
      name: 'IdemFail',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:edit'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const before = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();

    let failOnce = true;
    harness.users.addOnUserDisabled(
      async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('transient revoke failure');
        }
      },
      { critical: true },
    );

    const key = `${Date.now()}.${randomUUID()}`;
    const run = () =>
      executeIdempotentMutation({
        connection: harness.database.connection(),
        key,
        principal: 'admin-1',
        operation: `POST /users/${userId}/disable`,
        input: null,
        authorize: () => undefined,
        authorizeReplay: () => undefined,
        execute: (transaction) =>
          harness.users.withConnection(transaction).disable(userId),
      });

    await expect(run()).rejects.toThrow('transient revoke failure');
    expect((await harness.users.get(userId))?.disabledAt).toBeNull();
    const mid = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(mid.credentialEpoch)).toBe(Number(before.credentialEpoch));

    const recovered = await run();
    expect(recovered.replayed).toBe(false);
    expect((await harness.users.get(userId))?.disabledAt).not.toBeNull();
    const after = await harness.database
      .connection()
      .query.selectFrom('agentGrants')
      .select('credentialEpoch')
      .where('id', '=', grant.id)
      .executeTakeFirstOrThrow();
    expect(Number(after.credentialEpoch)).toBe(
      Number(before.credentialEpoch) + 1,
    );
  });
});
