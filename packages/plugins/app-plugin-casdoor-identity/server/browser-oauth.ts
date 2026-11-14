/**
 * Better Auth `genericOAuth` seam for Casdoor browser first-login (NEXT-02).
 *
 * Better Auth 1.7.5 exposes no post-callback hook. The narrowest supported seam is
 * `getUserInfo`: it runs after token exchange and before account/session creation.
 * Here we run provisioning + admission, then ensure a native `account` row links
 * the Casdoor subject to the provisioned local user so JWT-first and browser-first
 * converge on one identity without hand-inserting auth tables.
 *
 * Auth / provisioning are injected at plugin boot via {@link setCasdoorBrowserOAuthRuntime}
 * because application `auth.ts` is evaluated before the container is ready.
 */
import type { Auth } from '@nocobase/app-plugin-authentication/server';
import { decodeJwt } from 'jose';

import type { IdentityProvisioningService } from './services/identity-provisioning.js';

export const CASDOOR_OAUTH_PROVIDER_ID = 'casdoor';

export interface CasdoorBrowserOAuthRuntime {
  readonly auth: Auth;
  readonly provisioning: IdentityProvisioningService;
  readonly issuer: string;
}

let runtime: CasdoorBrowserOAuthRuntime | undefined;

/** Called from CasdoorIdentityProvider.boot once Auth and provisioning are registered. */
export function setCasdoorBrowserOAuthRuntime(
  next: CasdoorBrowserOAuthRuntime | undefined,
): void {
  runtime = next;
}

export function getCasdoorBrowserOAuthRuntime():
  CasdoorBrowserOAuthRuntime | undefined {
  return runtime;
}

export interface CasdoorBrowserOAuthClientOptions {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes?: readonly string[];
  readonly discoveryUrl?: string;
}

export interface BrowserLoginProfile {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
  readonly [key: string]: unknown;
}

/**
 * Ensures externalIdentities + a Better Auth account row for the Casdoor subject,
 * then returns the profile Better Auth maps into the session user.
 */
export async function ensureCasdoorBrowserIdentity(input: {
  readonly issuer: string;
  readonly subject: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly auth: Auth;
  readonly provisioning: IdentityProvisioningService;
}): Promise<BrowserLoginProfile> {
  const binding = await input.provisioning.onLogin({
    issuer: input.issuer,
    subject: input.subject,
    attributes: input.attributes,
  });

  const context = await input.auth.administrationContext();
  const existing = await context.internalAdapter.findAccountByKey({
    providerId: CASDOOR_OAUTH_PROVIDER_ID,
    accountId: input.subject,
  });
  if (!existing) {
    await context.internalAdapter.linkAccount({
      providerId: CASDOOR_OAUTH_PROVIDER_ID,
      accountId: input.subject,
      userId: binding.localUserId,
    });
  } else if (existing.userId !== binding.localUserId) {
    throw new Error(
      'Casdoor OAuth account is linked to a different local user than the external identity.',
    );
  }

  const user = await context.internalAdapter.findUserById(binding.localUserId);
  if (!user) {
    throw new Error(
      'Provisioned local user is missing after Casdoor browser login.',
    );
  }

  const record = user as {
    email?: string;
    emailVerified?: boolean;
    name?: string;
  };
  const emailCandidate =
    record.email ??
    attributeString(input.attributes, 'email') ??
    `${input.subject}@casdoor.local`;
  const nameCandidate =
    record.name ??
    attributeString(input.attributes, 'name') ??
    attributeString(input.attributes, 'displayName') ??
    input.subject;

  return {
    id: input.subject,
    email: emailCandidate,
    emailVerified: Boolean(
      record.emailVerified ?? input.attributes.email_verified ?? true,
    ),
    name: nameCandidate,
  };
}

function attributeString(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = attributes[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Decode OAuth tokens into issuer/subject/attributes for provisioning. */
export function claimsFromOAuthTokens(
  tokens: {
    readonly idToken?: string | null;
    readonly accessToken?: string | null;
  },
  fallbackIssuer: string,
): {
  readonly issuer: string;
  readonly subject: string;
  readonly attributes: Readonly<Record<string, unknown>>;
} {
  const raw = tokens.idToken ?? tokens.accessToken;
  if (!raw) {
    throw new Error(
      'Casdoor OAuth callback returned no id_token or access_token.',
    );
  }
  const payload = decodeJwt(raw) as Record<string, unknown>;
  const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
  if (!subject) {
    throw new Error('Casdoor OAuth token is missing a subject claim.');
  }
  const issuer = typeof payload.iss === 'string' ? payload.iss : fallbackIssuer;
  return { issuer, subject, attributes: payload };
}

/**
 * Builds a `genericOAuth` provider entry that runs admission + provisioning before
 * Better Auth issues a session. Keep `disableImplicitSignUp: true`: the account
 * row is created through Auth's `linkAccount` after provisioning succeeds.
 */
export function createCasdoorBrowserOAuthConfig(
  options: CasdoorBrowserOAuthClientOptions,
): {
  readonly providerId: typeof CASDOOR_OAUTH_PROVIDER_ID;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly discoveryUrl: string;
  readonly scopes: string[];
  readonly pkce: true;
  readonly disableImplicitSignUp: true;
  readonly getUserInfo: (tokens: {
    readonly idToken?: string | null;
    readonly accessToken?: string | null;
  }) => Promise<BrowserLoginProfile>;
} {
  return {
    providerId: CASDOOR_OAUTH_PROVIDER_ID,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    discoveryUrl:
      options.discoveryUrl ??
      `${options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    scopes: [...(options.scopes ?? ['openid', 'profile', 'email'])],
    pkce: true,
    disableImplicitSignUp: true,
    getUserInfo: async (tokens) => {
      const current = getCasdoorBrowserOAuthRuntime();
      if (!current) {
        throw new Error(
          'Casdoor browser OAuth runtime is not ready; the identity plugin must boot first.',
        );
      }
      const claims = claimsFromOAuthTokens(tokens, options.issuer);
      return ensureCasdoorBrowserIdentity({
        issuer: claims.issuer,
        subject: claims.subject,
        attributes: claims.attributes,
        auth: current.auth,
        provisioning: current.provisioning,
      });
    },
  };
}
