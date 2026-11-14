// @vitest-environment node

import { SignJWT, generateKeyPair } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimsFromOAuthTokens,
  ensureCasdoorBrowserIdentity,
} from '../../server/browser-oauth.js';
import {
  createIdentityHarness,
  ISSUER,
  registerProvider,
  type IdentityHarness,
} from '../helpers/harness.js';

describe('Casdoor browser OAuth seam (NEXT-02 / N07–N10)', () => {
  let harness: IdentityHarness;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor'],
    });
  });
  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    const { query } = harness.database.connection();
    for (const table of [
      'managedPermissionAssignments',
      'identityMappingRules',
      'identityProviders',
      'externalIdentities',
      'account',
      'session',
      'user',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
  });

  it('claimsFromOAuthTokens reads issuer and subject from an id_token', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const idToken = await new SignJWT({
      email: 'alice@acme.test',
      email_verified: true,
      owner: 'acme',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setSubject('alice')
      .setExpirationTime('5m')
      .sign(privateKey);
    const claims = claimsFromOAuthTokens({ idToken }, ISSUER);
    expect(claims.subject).toBe('alice');
    expect(claims.issuer).toBe(ISSUER);
    expect(claims.attributes.email).toBe('alice@acme.test');
  });

  it('N07/N08: browser ensure creates one user+externalIdentity+account and reuses them', async () => {
    await registerProvider(harness);
    const attributes = {
      owner: 'acme',
      email: 'erin@acme.test',
      email_verified: true,
      displayName: 'Erin',
    };
    const first = await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'erin',
      attributes,
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
    expect(first.email).toBe('erin@acme.test');

    const second = await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'erin',
      attributes,
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
    expect(second.email).toBe(first.email);

    const identities = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .selectAll()
      .execute();
    expect(identities).toHaveLength(1);
    const accounts = await harness.database
      .connection()
      .query.selectFrom('account')
      .selectAll()
      .where('providerId', '=', 'casdoor')
      .execute();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.accountId).toBe('erin');
    expect(accounts[0]!.userId).toBe(identities[0]!.localUserId);
  });

  it('N09: admission deny does not leave an account row', async () => {
    await registerProvider(harness, { allowOrganizations: ['other'] });
    await expect(
      ensureCasdoorBrowserIdentity({
        issuer: ISSUER,
        subject: 'denied',
        attributes: {
          owner: 'acme',
          email: 'denied@acme.test',
          email_verified: true,
        },
        auth: harness.auth,
        provisioning: harness.services.provisioning,
      }),
    ).rejects.toMatchObject({ reason: 'ADMISSION_DENIED' });
    expect(
      (
        await harness.database
          .connection()
          .query.selectFrom('user')
          .select('id')
          .execute()
      ).length,
    ).toBe(0);
    expect(
      (
        await harness.database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute()
      ).length,
    ).toBe(0);
  });

  it('N09: same email different subject rejects without merging', async () => {
    await registerProvider(harness);
    await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'first',
      attributes: {
        owner: 'acme',
        email: 'shared@acme.test',
        email_verified: true,
      },
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
    await expect(
      ensureCasdoorBrowserIdentity({
        issuer: ISSUER,
        subject: 'second',
        attributes: {
          owner: 'acme',
          email: 'shared@acme.test',
          email_verified: true,
        },
        auth: harness.auth,
        provisioning: harness.services.provisioning,
      }),
    ).rejects.toMatchObject({ reason: 'IDENTITY_EMAIL_CONFLICT' });
  });

  it('JWT-first then browser links the same local user', async () => {
    await registerProvider(harness);
    const jwt = await harness.services.provisioning.onLogin({
      issuer: ISSUER,
      subject: 'jordan',
      attributes: {
        owner: 'acme',
        email: 'jordan@acme.test',
        email_verified: true,
        displayName: 'Jordan',
      },
    });
    const browser = await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'jordan',
      attributes: {
        owner: 'acme',
        email: 'jordan@acme.test',
        email_verified: true,
      },
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
    const account = await harness.database
      .connection()
      .query.selectFrom('account')
      .selectAll()
      .where('providerId', '=', 'casdoor')
      .where('accountId', '=', 'jordan')
      .executeTakeFirstOrThrow();
    expect(account.userId).toBe(jwt.localUserId);
    expect(browser.email).toBe('jordan@acme.test');
  });

  it('N10: disabled provider refuses a new browser ensure after a prior success', async () => {
    await registerProvider(harness);
    const attributes = {
      owner: 'acme',
      email: 'disabled-provider@acme.test',
      email_verified: true,
    };
    await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'disabled-provider',
      attributes,
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
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
      ensureCasdoorBrowserIdentity({
        issuer: ISSUER,
        subject: 'disabled-provider',
        attributes,
        auth: harness.auth,
        provisioning: harness.services.provisioning,
      }),
    ).rejects.toMatchObject({ reason: 'IDENTITY_PROVIDER_DISABLED' });
  });

  it('N10: disabled local account refuses a new browser ensure', async () => {
    await registerProvider(harness);
    const profile = await ensureCasdoorBrowserIdentity({
      issuer: ISSUER,
      subject: 'disabled-user',
      attributes: {
        owner: 'acme',
        email: 'disabled-user@acme.test',
        email_verified: true,
      },
      auth: harness.auth,
      provisioning: harness.services.provisioning,
    });
    const identity = await harness.database
      .connection()
      .query.selectFrom('externalIdentities')
      .select(['localUserId'])
      .where('providerSubject', '=', 'disabled-user')
      .executeTakeFirstOrThrow();
    await harness.users.disable(String(identity.localUserId));
    await expect(
      ensureCasdoorBrowserIdentity({
        issuer: ISSUER,
        subject: 'disabled-user',
        attributes: {
          owner: 'acme',
          email: profile.email,
          email_verified: true,
        },
        auth: harness.auth,
        provisioning: harness.services.provisioning,
      }),
    ).rejects.toMatchObject({ reason: 'ACCOUNT_DISABLED' });
  });
});
