import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { DatabaseManager } from '@nocobase/db';
import { SignJWT } from 'jose';
import { expect, it } from 'vitest';

import { OidcAdapter, verifyIdToken } from '../../../server/adapters/oidc.js';
import type {
  AdapterDependencies,
  LdapDirectoryEntry,
  ProviderBinding,
} from '../../../server/adapters/types.js';
import { InMemoryOutboxPublisher } from '../../../server/outbox.js';
import { HubRuntime } from '../../../server/runtime.js';
import {
  createIdentityHubServices,
  type IdentityHubServices,
} from '../../../server/services/create.js';
import { clearDatabaseEnv } from '../../helpers/clear-db-env.js';

clearDatabaseEnv();

const secret = new TextEncoder().encode('identity-hub-test-secret-32bytes!');

const test = createDatabaseTest({
  migrations: [
    {
      packageName: '@nocobase/app-plugin-identity-hub',
      directory: fileURLToPath(
        new URL('../../../database/migrations', import.meta.url),
      ),
    },
  ],
});

function hub(
  database: DatabaseManager,
  deps: AdapterDependencies = {},
): IdentityHubServices {
  return createIdentityHubServices(
    new HubRuntime(database, new InMemoryOutboxPublisher()),
    deps,
  );
}

const oidcBinding: ProviderBinding = {
  providerId: 'oidc',
  providerType: 'oidc',
  issuer: 'https://idp.example',
  discoveryUrl: null,
  endpoints: { audience: 'hub' },
  claimMapping: null,
  syncPolicy: null,
};

function signToken(input: {
  issuer?: string;
  audience?: string;
  subject?: string;
  nonce?: string;
}): Promise<string> {
  return new SignJWT(input.nonce ? { nonce: input.nonce } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(input.issuer ?? 'https://idp.example')
    .setAudience(input.audience ?? 'hub')
    .setSubject(input.subject ?? 'user-1')
    .setExpirationTime('2h')
    .sign(secret);
}

it('rejects an unsigned OIDC token and a token with the wrong issuer, audience, or nonce', async () => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-1',
      iss: 'https://idp.example',
      aud: 'hub',
    }),
  ).toString('base64url');
  await expect(
    verifyIdToken(`${header}.${payload}.`, {
      getKey: async () => secret,
      issuer: 'https://idp.example',
      audience: 'hub',
    }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_OIDC_TOKEN_UNSIGNED' });

  await expect(
    verifyIdToken(await signToken({ issuer: 'https://evil.example' }), {
      getKey: async () => secret,
      issuer: 'https://idp.example',
      audience: 'hub',
    }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_OIDC_ISSUER_MISMATCH' });

  await expect(
    verifyIdToken(await signToken({ audience: 'other-app' }), {
      getKey: async () => secret,
      issuer: 'https://idp.example',
      audience: 'hub',
    }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_OIDC_AUDIENCE_MISMATCH' });

  await expect(
    verifyIdToken(await signToken({ nonce: 'from-token' }), {
      getKey: async () => secret,
      issuer: 'https://idp.example',
      audience: 'hub',
      nonce: 'from-client',
    }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_OIDC_NONCE_MISMATCH' });

  const accepted = await verifyIdToken(await signToken({ nonce: 'n1' }), {
    getKey: async () => secret,
    issuer: 'https://idp.example',
    audience: 'hub',
    nonce: 'n1',
  });
  expect(accepted.sub).toBe('user-1');
});

it('rejects a mismatched OIDC state before exchanging the code and accepts a fake verifier', async () => {
  let exchanged = false;
  const adapter = new OidcAdapter(oidcBinding, {
    oidc: {
      fetchJwks: async () => ({ keys: [] }),
      exchangeCode: async () => {
        exchanged = true;
        return { idToken: 'token' };
      },
    },
    oidcVerifier: {
      verifyIdToken: async () => ({
        iss: 'https://IdP.Example/',
        sub: 'user-1',
        claims: { email: 'Ada@Example.com', email_verified: true },
      }),
    },
  });
  await expect(
    adapter.authenticate({
      code: 'code',
      state: 'sent',
      expectedState: 'stored',
    }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_STATE_MISMATCH' });
  expect(exchanged).toBe(false);

  const identity = await adapter.authenticate({
    code: 'code',
    state: 'stored',
    expectedState: 'stored',
    nonce: 'n1',
  });
  expect(identity.identityKey).toBe('https://idp.example|user-1');
  expect(identity.claims.email).toBe('ada@example.com');
  expect(identity.claims.emailVerified).toBe(true);
  expect(exchanged).toBe(true);
});

test('links a manual identity and an OIDC identity to the same person', async ({
  database,
}) => {
  const services = hub(database, {
    oidc: {
      fetchJwks: async () => ({ keys: [] }),
      exchangeCode: async () => ({ idToken: 'token' }),
    },
    oidcVerifier: {
      verifyIdToken: async () => ({
        iss: 'https://idp.example',
        sub: 'oidc-user',
        claims: { email_verified: true },
      }),
    },
  });
  await services.providers.create({
    providerId: 'manual',
    providerType: 'manual',
    displayName: 'Manual',
  });
  await services.providers.create({
    providerId: 'oidc',
    providerType: 'oidc',
    displayName: 'OIDC',
    issuer: 'https://idp.example',
    endpoints: { audience: 'hub' },
  });
  const person = await services.persons.create({ displayName: 'Ada' });
  const manual = await services.adapters.resolve('manual');
  const oidc = await services.adapters.resolve('oidc');
  await services.identities.upsertVerified(
    person.personId,
    await manual.resolveIdentity!({ manualAccountId: 'ada-manual' }),
  );
  await services.identities.upsertVerified(
    person.personId,
    await oidc.authenticate!({
      code: 'code',
      state: 's',
      expectedState: 's',
    }),
  );
  const identities = await services.identities.listForPerson(person.personId);
  expect(identities).toHaveLength(2);
  expect(identities.map((item) => item.personId)).toEqual([
    person.personId,
    person.personId,
  ]);
  expect(identities.map((item) => item.providerType).sort()).toEqual([
    'manual',
    'oidc',
  ]);
});

test('keeps one LDAP identity when the same GUID is seen under a new DN', async ({
  database,
}) => {
  const services = hub(database);
  await services.providers.create({
    providerId: 'ldap',
    providerType: 'ldap',
    displayName: 'LDAP',
  });
  const adapter = await services.adapters.resolve('ldap');
  const first = await adapter.resolveIdentity!({
    attributes: {
      objectGUID: 'guid-1',
      dn: 'cn=Ada,ou=old,dc=example,dc=com',
    },
  });
  const second = await adapter.resolveIdentity!({
    attributes: {
      objectGUID: 'guid-1',
      entryUUID: 'uuid-should-not-win',
      dn: 'cn=Ada,ou=new,dc=example,dc=com',
    },
  });
  expect(first.identityKey).toBe('guid-1');
  expect(second.identityKey).toBe(first.identityKey);
  expect(first.identityKey).not.toBe(first.externalUsername);
  expect(second.externalUsername).toBe('cn=Ada,ou=new,dc=example,dc=com');

  const fromUuid = await adapter.resolveIdentity!({
    attributes: {
      entryUUID: 'uuid-2',
      dn: 'cn=Grace,ou=people,dc=example,dc=com',
    },
  });
  expect(fromUuid.identityKey).toBe('uuid-2');

  const person = await services.persons.create({ displayName: 'Ada' });
  await services.identities.upsertVerified(person.personId, first);
  await services.identities.upsertVerified(person.personId, second);
  const identities = await services.identities.listForPerson(person.personId);
  expect(identities).toHaveLength(1);
  expect(identities[0]).toMatchObject({
    identityKey: 'guid-1',
    externalUsername: 'cn=Ada,ou=new,dc=example,dc=com',
    status: 'active',
  });
});

test('refuses OAuth2 auto-provisioning when userInfo has no stable subject', async ({
  database,
}) => {
  const services = hub(database, {
    oauth2: {
      health: async () => ({ ok: true }),
      exchangeCode: async () => ({ accessToken: 'token' }),
      fetchUserInfo: async () => ({ email: 'ada@example.com', name: 'Ada' }),
    },
  });
  await services.providers.create({
    providerId: 'oauth',
    providerType: 'oauth2',
    displayName: 'OAuth2',
    endpoints: { stableIdField: 'id' },
  });
  const adapter = await services.adapters.resolve('oauth');
  await expect(
    adapter.authenticate!({
      code: 'code',
      codeVerifier: 'verifier',
      state: 's',
      expectedState: 's',
    }),
  ).rejects.toMatchObject({
    reason: 'STABLE_SUBJECT_REQUIRED',
    metadata: { decision: 'REFUSE_AUTO_PROVISION' },
  });
  expect((await services.persons.list()).total).toBe(0);
});

test('keeps manual resolution working when Casdoor is unregistered or disabled', async ({
  database,
}) => {
  const services = hub(database);
  await services.providers.create({
    providerId: 'casdoor',
    providerType: 'casdoor',
    displayName: 'Casdoor',
    issuer: 'https://casdoor.example',
  });
  await services.providers.create({
    providerId: 'casdoor-off',
    providerType: 'casdoor',
    displayName: 'Casdoor off',
    issuer: 'https://casdoor.example',
    enabled: false,
  });
  await services.providers.create({
    providerId: 'manual',
    providerType: 'manual',
    displayName: 'Manual',
  });
  services.adapters.unregister('casdoor');
  await expect(services.adapters.resolve('casdoor')).rejects.toMatchObject({
    reason: 'IDENTITY_HUB_ADAPTER_NOT_REGISTERED',
  });
  await expect(services.adapters.resolve('casdoor-off')).rejects.toMatchObject({
    reason: 'IDENTITY_HUB_PROVIDER_DISABLED',
  });
  const manual = await services.adapters.resolve('manual');
  expect(
    await manual.resolveIdentity!({ manualAccountId: 'local-1' }),
  ).toMatchObject({ identityKey: 'local-1', providerType: 'manual' });
});

test('rejects an unverified OA employee number and accepts the verifier result', async ({
  database,
}) => {
  const services = hub(database, {
    oa: {
      verify: async (input) =>
        input.ltpaToken === 'good' ? { employeeNo: 'E100' } : undefined,
    },
  });
  await services.providers.create({
    providerId: 'oa',
    providerType: 'oa-ltpa',
    displayName: 'OA',
  });
  const adapter = await services.adapters.resolve('oa');
  await expect(
    adapter.resolveIdentity!({ employeeNo: 'E100', ltpaToken: 'bad' }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_OA_UNVERIFIED' });
  const verified = await adapter.resolveIdentity!({
    employeeNo: 'EVIL',
    ltpaToken: 'good',
  });
  expect(verified.subject).toBe('E100');
  expect(verified.identityKey).toBe('oa|E100');
  expect(verified.claims.employeeNo).toBe('E100');
});

test('preview writes nothing and a sync run does not disable identities or call an app user API', async ({
  database,
}) => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../server/services/sync.ts', import.meta.url)),
    'utf8',
  );
  expect(source).not.toMatch(
    /app-plugin-authentication|app-plugin-users|UserAdministration/,
  );
  expect(source).not.toMatch(/\.disable\(/);

  const directory: LdapDirectoryEntry[] = [
    {
      dn: 'cn=New,ou=people,dc=example,dc=com',
      objectGUID: 'guid-new',
      attributes: { cn: 'New Person', employeeNo: 'E-NEW' },
    },
    {
      dn: 'cn=Ada,ou=moved,dc=example,dc=com',
      objectGUID: 'guid-keeper',
      attributes: { cn: 'Ada', employeeNo: 'E-OTHER' },
    },
  ];
  let runPages = 0;
  const services = hub(database, {
    ldap: {
      config: {
        url: 'ldaps://directory.example',
        tls: { rejectUnauthorized: true },
      },
      health: async () => ({ ok: true, detail: 'up' }),
      searchUsers: async () => {
        runPages += 1;
        if (runPages === 1) return { items: directory, nextCursor: null };
        if (runPages === 2) return { items: directory, nextCursor: 'next' };
        throw new Error('directory unavailable');
      },
    },
  });
  await services.providers.create({
    providerId: 'ldap',
    providerType: 'ldap',
    displayName: 'LDAP',
  });
  const keeper = await services.persons.create({
    displayName: 'Ada',
    employeeNo: 'E-KEEPER',
  });
  const other = await services.persons.create({
    displayName: 'Other',
    employeeNo: 'E-OTHER',
  });
  const adapter = await services.adapters.resolve('ldap');
  await services.identities.upsertVerified(
    keeper.personId,
    await adapter.resolveIdentity!({
      attributes: {
        objectGUID: 'guid-keeper',
        dn: 'cn=Ada,ou=old,dc=example,dc=com',
      },
    }),
  );

  const personsBefore = (await services.persons.list()).total;
  const conflictsBefore = (await services.conflicts.list()).total;
  const runsBefore = (await services.sync.listSyncRuns('ldap')).total;
  const preview = await services.sync.syncPreview('ldap');
  expect(preview.proposals.map((item) => item.action)).toEqual([
    'create',
    'conflict',
  ]);
  expect((await services.persons.list()).total).toBe(personsBefore);
  expect((await services.conflicts.list()).total).toBe(conflictsBefore);
  expect((await services.sync.listSyncRuns('ldap')).total).toBe(runsBefore);
  expect(
    (await services.identities.listForPerson(keeper.personId))[0]?.status,
  ).toBe('active');

  const run = await services.sync.syncRun('ldap');
  expect(run.status).toBe('failed');
  expect(run.error).toMatch(/directory unavailable/);
  expect(run.stats.created).toBe(1);
  expect(run.stats.conflicts).toBe(1);
  expect(run.stats.failed).toBe(0);
  const kept = await services.identities.listForPerson(keeper.personId);
  expect(kept).toHaveLength(1);
  expect(kept[0]?.status).toBe('active');
  expect((await services.persons.get(keeper.personId)).status).toBe('active');
  expect((await services.persons.get(other.personId)).status).toBe('active');
  const created = await services.persons.list({ pageSize: 100 });
  expect(created.total).toBe(personsBefore + 1);

  const health = await services.sync.testConnection('ldap');
  expect(health.ok).toBe(true);
  expect((await services.providers.get('ldap')).lastHealthCheckAt).toEqual(
    expect.any(String),
  );
});
