// @vitest-environment node

import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { apiErrorHandler, describeRoute } from '@nocobase/app-server/router';
import { Hono } from 'hono';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CASDOOR_ACCESS_TOKEN_HEADER,
  CASDOOR_ACCESS_TOKEN_SCHEME,
} from '../../server/config.js';
import { createCasdoorCredentialResolver } from '../../server/credential-resolver.js';
import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

const AUDIENCE = 'nocobase-casdoor-identity';

describe('Casdoor login through the credential resolver (IAM-001..007)', () => {
  let harness: IdentityHarness;
  let router: Hono<AuthEnv>;
  let privateKey: KeyLike;
  let jwk: JWK;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor'],
    });
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    jwk = await exportJWK(keys.publicKey);
    jwk.kid = 'test';
    jwk.alg = 'RS256';

    harness.auth.addCredentialResolver(
      createCasdoorCredentialResolver({
        connection: () => harness.database.connection(),
        config: () => ({
          issuer: ISSUER,
          audience: AUDIENCE,
          jwks: { keys: [jwk as Record<string, unknown>] },
        }),
        identity: () => harness.services.provisioning,
      }),
    );
    harness.auth.addCredentialRoutePolicy((context, credential) =>
      credential.scheme === CASDOOR_ACCESS_TOKEN_SCHEME &&
      context.req.path === '/me'
        ? true
        : undefined,
    );
    router = new Hono<AuthEnv>();
    router.onError((error, context) => apiErrorHandler(error, context));
    router.get(
      '/me',
      describeRoute({
        security: [{ cookieAuth: [] }, { [CASDOOR_ACCESS_TOKEN_SCHEME]: [] }],
      }),
      harness.auth.required({ scopedKeys: true }),
      (context) =>
        context.json({ data: { userId: context.get('auth')!.user.id } }),
    );
  });
  afterAll(async () => {
    await harness.close();
  });

  const sign = (subject: string, claims: Record<string, unknown> = {}) =>
    new SignJWT({
      owner: 'acme',
      email: `${subject}@acme.test`,
      email_verified: true,
      displayName: subject,
      groups: ['editors'],
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  const call = async (subject: string, claims?: Record<string, unknown>) =>
    router.request('/me', {
      headers: { [CASDOOR_ACCESS_TOKEN_HEADER]: await sign(subject, claims) },
    });
  const userCount = async (): Promise<number> =>
    (
      await harness.database
        .connection()
        .query.selectFrom('user')
        .select('id')
        .execute()
    ).length;

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'managedPermissionAssignments',
      'identityMappingRules',
      'identityProviders',
      'externalIdentities',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    for (const entry of await harness.authz.permissionSets.listAssignments()) {
      if (entry.subject.type === 'user')
        await harness.authz.permissionSets.revoke(entry.id);
    }
    await query.deleteFrom('session').allowAllRows().execute();
    await query.deleteFrom('account').allowAllRows().execute();
    await query.deleteFrom('user').allowAllRows().execute();
  });

  it('denies an unbound subject when no provider is configured', async () => {
    const response = await call('nobody');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { reason: 'SUBJECT_BINDING_REQUIRED' },
    });
    expect(await userCount()).toBe(0);
  });

  it('provisions on the first login, maps Permission Sets, and reuses the user afterwards', async () => {
    await registerProvider(harness);
    await harness.services.mapping.createRule(
      {
        ruleId: 'r-editors',
        providerId: 'casdoor',
        claim: 'groups',
        claimValue: 'editors',
        permissionSetKey: 'content-editor',
      },
      null,
    );
    const first = await call('erin');
    expect(first.status).toBe(200);
    const { data } = (await first.json()) as { data: { userId: string } };
    const second = await call('erin', { displayName: 'Erin Renamed' });
    expect(
      ((await second.json()) as { data: { userId: string } }).data.userId,
    ).toBe(data.userId);
    expect(await userCount()).toBe(1);
    expect(
      (await harness.authz.permissionSets.listAssignments())
        .filter((entry) => entry.subject.id === data.userId)
        .map((entry) => entry.permissionSet),
    ).toEqual(['content-editor']);
  });

  it('creates one user for concurrent first-login requests', async () => {
    await registerProvider(harness);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => call('frank')),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(8).fill(200),
    );
    const ids = await Promise.all(
      responses.map(
        async (response) =>
          ((await response.json()) as { data: { userId: string } }).data.userId,
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await userCount()).toBe(1);
  });

  it('answers 403 ADMISSION_DENIED for a user the policy does not admit', async () => {
    await registerProvider(harness);
    const response = await call('mallory', { owner: 'other' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { reason: 'ADMISSION_DENIED' },
    });
    expect(await userCount()).toBe(0);
  });

  it('SEC-03: a second subject with a taken e-mail is refused (409), not merged', async () => {
    await registerProvider(harness);
    expect((await call('gina', { email: 'shared@acme.test' })).status).toBe(
      200,
    );
    const response = await call('gina-2', { email: 'shared@acme.test' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { reason: 'IDENTITY_EMAIL_CONFLICT' },
    });
    expect(await userCount()).toBe(1);
  });

  it('rejects a disabled user even though the token still verifies, and again after re-enable requires a fresh login', async () => {
    await registerProvider(harness);
    const response = await call('hank');
    const { data } = (await response.json()) as { data: { userId: string } };
    await harness.users.disable(data.userId);
    const denied = await call('hank');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      error: { reason: 'ACCOUNT_DISABLED' },
    });
    await harness.users.enable(data.userId);
    expect(await harness.sessionCount(data.userId)).toBe(0);
    expect((await call('hank')).status).toBe(200);
  });
});
