// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

const token = (subject: string, attributes: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  subject,
  attributes: {
    owner: 'acme',
    email: `${subject}@acme.test`,
    email_verified: true,
    displayName: subject,
    ...attributes,
  },
});

describe('first login and repeat login (IAM-001, IAM-002, IAM-003)', () => {
  let harness: IdentityHarness;

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });
  afterAll(async () => {
    await harness.close();
  });

  async function reset(): Promise<void> {
    const { query } = harness.database.connection();
    await query.deleteFrom('externalIdentities').allowAllRows().execute();
    await query.deleteFrom('identityProviders').allowAllRows().execute();
    await query.deleteFrom('user').allowAllRows().execute();
  }
  const count = async (table: string): Promise<number> =>
    (
      await harness.database
        .connection()
        .query.selectFrom(table)
        .select('id')
        .execute()
    ).length;

  beforeEach(async () => {
    await reset();
  });

  it('creates the local user and the binding on the first admitted login', async () => {
    await registerProvider(harness);
    const result = await harness.services.provisioning.onLogin(token('alice'));
    expect(result.created).toBe(true);
    const row = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .selectAll()
      .where('providerSubject', '=', 'alice')
      .executeTakeFirst();
    expect(row).toMatchObject({
      providerIssuer: ISSUER,
      localUserId: result.localUserId,
    });
    const user = await harness.users.get(result.localUserId);
    expect(user).toMatchObject({
      email: 'alice@acme.test',
      emailVerified: true,
    });
    const audit = await harness.services.audit.list({
      targetType: 'externalIdentity',
    });
    expect(audit.map((event) => event.action)).toContain('identity.provision');
  });

  it('reuses the same account on repeat login, even when name and e-mail claims change', async () => {
    await registerProvider(harness);
    const first = await harness.services.provisioning.onLogin(token('alice'));
    const second = await harness.services.provisioning.onLogin(
      token('alice', {
        displayName: 'Alice Renamed',
        email: 'alice.new@acme.test',
      }),
    );
    expect(second).toMatchObject({
      created: false,
      localUserId: first.localUserId,
    });
    expect(await count('user')).toBe(1);
    expect(await count('externalIdentities')).toBe(1);
    expect((await harness.users.get(first.localUserId))?.name).toBe(
      'Alice Renamed',
    );
  });

  it('refuses to provision without an enabled provider (deny by default)', async () => {
    await expect(
      harness.services.provisioning.onLogin(token('alice')),
    ).rejects.toMatchObject({
      reason: 'IDENTITY_PROVIDER_DISABLED',
      status: 'PERMISSION_DENIED',
    });
    expect(await count('user')).toBe(0);
  });

  it('I01: refuses repeat login when the provider is disabled, even with an existing binding', async () => {
    await registerProvider(harness);
    const first = await harness.services.provisioning.onLogin(token('alice'));
    expect(first.created).toBe(true);
    await harness.services.providers.upsert(
      {
        providerId: 'casdoor',
        issuer: ISSUER,
        admissionPolicy: { allowOrganizations: ['acme'] },
        enabled: false,
      },
      null,
    );
    await expect(
      harness.services.provisioning.onLogin(token('alice')),
    ).rejects.toMatchObject({
      reason: 'IDENTITY_PROVIDER_DISABLED',
      status: 'PERMISSION_DENIED',
    });
  });

  it('refuses every user when the provider has no admission allow entries', async () => {
    await registerProvider(harness, {});
    await expect(
      harness.services.provisioning.onLogin(token('alice')),
    ).rejects.toMatchObject({ reason: 'ADMISSION_DENIED' });
    expect(await count('user')).toBe(0);
    expect(await count('externalIdentities')).toBe(0);
  });

  it('refuses a user the policy does not admit, and re-checks admission on repeat login', async () => {
    await registerProvider(harness);
    await expect(
      harness.services.provisioning.onLogin(
        token('mallory', { owner: 'other' }),
      ),
    ).rejects.toMatchObject({ reason: 'ADMISSION_DENIED' });
    await harness.services.provisioning.onLogin(token('alice'));
    await expect(
      harness.services.provisioning.onLogin(token('alice', { owner: 'other' })),
    ).rejects.toMatchObject({ reason: 'ADMISSION_DENIED' });
    expect(await count('user')).toBe(1);
  });

  it('creates exactly one user and binding for concurrent first logins', async () => {
    await registerProvider(harness);
    // Two independent service graphs stand in for two processes: only the unique index separates them.
    const other = harness.spawnServices();
    const attempts = Array.from({ length: 10 }, (_, index) =>
      (index % 2 === 0 ? harness.services : other).provisioning.onLogin(
        token('bob'),
      ),
    );
    const results = await Promise.all(attempts);
    expect(new Set(results.map((result) => result.localUserId)).size).toBe(1);
    expect(new Set(results.map((result) => result.bindingId)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await count('user')).toBe(1);
    expect(await count('externalIdentities')).toBe(1);
  });

  it('SEC-03: the same e-mail under a different subject is not merged', async () => {
    await registerProvider(harness);
    const first = await harness.services.provisioning.onLogin(
      token('carol', { email: 'shared@acme.test' }),
    );
    await expect(
      harness.services.provisioning.onLogin(
        token('carol-2', { email: 'shared@acme.test' }),
      ),
    ).rejects.toMatchObject({
      reason: 'IDENTITY_EMAIL_CONFLICT',
      status: 'ALREADY_EXISTS',
    });

    const second = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .select('id')
      .where('providerSubject', '=', 'carol-2')
      .executeTakeFirst();
    expect(second).toBeUndefined();
    expect(await count('user')).toBe(1);
    const survivor = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .select('localUserId')
      .where('providerSubject', '=', 'carol')
      .executeTakeFirst();
    expect(survivor?.localUserId).toBe(first.localUserId);
  });

  it('does not match an existing local user by e-mail either', async () => {
    await registerProvider(harness);
    await harness.createLocalUser('dave@acme.test');
    await expect(
      harness.services.provisioning.onLogin(token('dave')),
    ).rejects.toMatchObject({ reason: 'IDENTITY_EMAIL_CONFLICT' });
    expect(await count('externalIdentities')).toBe(0);
  });
});
