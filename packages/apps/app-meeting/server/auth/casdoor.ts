import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  CASDOOR_OAUTH_PROVIDER_ID,
  createCasdoorBrowserOAuthConfig,
  ensureCasdoorBrowserIdentity,
} from '@nocobase/app-plugin-casdoor-identity/server';
import { casdoorIdentityAdminToken } from '@nocobase/app-plugin-casdoor-identity/server/tokens';
import type { AppRuntimeContext } from '@nocobase/app-server/runtime';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import { createRemoteJWKSet, decodeJwt } from 'jose';

import type { MeetingCasdoorBrowserConfig } from '../config/casdoor-identity.js';

const REQUEST_TIMEOUT_MS = 3_000;

function trustedEndpoint(value: unknown, issuer: string): string {
  if (typeof value !== 'string') throw new Error('Missing Casdoor endpoint.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== new URL(issuer).origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error('Casdoor endpoints must use the configured HTTPS origin.');
  return url.href;
}

async function discover(issuer: string) {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('Casdoor discovery failed.');
  const metadata = (await response.json()) as Record<string, unknown>;
  if (
    metadata.issuer !== issuer ||
    !Array.isArray(metadata.id_token_signing_alg_values_supported) ||
    !metadata.id_token_signing_alg_values_supported.includes('RS256') ||
    !Array.isArray(metadata.code_challenge_methods_supported) ||
    !metadata.code_challenge_methods_supported.includes('S256')
  )
    throw new Error(
      'Casdoor discovery must match the configured issuer and advertise RS256 and PKCE S256.',
    );
  return {
    issuer,
    authorization_endpoint: trustedEndpoint(
      metadata.authorization_endpoint,
      issuer,
    ),
    token_endpoint: trustedEndpoint(metadata.token_endpoint, issuer),
    jwks_uri: trustedEndpoint(metadata.jwks_uri, issuer),
    id_token_signing_alg_values_supported: ['RS256'],
  };
}

export function meetingCasdoorBrowserAuth(
  settings: MeetingCasdoorBrowserConfig,
  app: () => AppRuntimeContext['app'],
): BetterAuthPlugin {
  return {
    id: 'meeting-casdoor-browser',
    hooks: {
      before: [
        {
          matcher: ({ path, body }) => {
            const input: unknown = body;
            return (
              typeof input === 'object' &&
              input !== null &&
              'provider' in input &&
              input.provider === CASDOOR_OAUTH_PROVIDER_ID &&
              (path === '/link-social' ||
                (path === '/sign-in/social' &&
                  'idToken' in input &&
                  input.idToken !== undefined))
            );
          },
          handler: createAuthMiddleware(async () => {
            throw new APIError('FORBIDDEN', {
              code: 'CASDOOR_BROWSER_FLOW_REQUIRED',
              message: 'Casdoor requires browser sign-in.',
            });
          }),
        },
      ],
    },
    async init(context) {
      try {
        if (!context.baseURL || new URL(context.baseURL).protocol !== 'https:')
          throw new Error(
            'Meeting requires a public HTTPS origin for Casdoor.',
          );
        const metadata = await discover(settings.issuer);
        const base = createCasdoorBrowserOAuthConfig(settings);
        const plugin = genericOAuth({
          config: [
            {
              ...base,
              requireIdTokenVerification: true,
              discoveryHeaders: { Accept: 'application/json' },
              authorizationUrl: metadata.authorization_endpoint,
              tokenUrl: metadata.token_endpoint,
              disableSignUp: true,
              disableProviderLogout: true,
              // Neither the client secret nor the authorization code may cross an HTTP redirect.
              getToken: async ({ code, codeVerifier, redirectURI }) => {
                if (!codeVerifier) throw new Error('Casdoor requires PKCE.');
                const response = await fetch(metadata.token_endpoint, {
                  method: 'POST',
                  redirect: 'error',
                  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                  body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: codeVerifier,
                    redirect_uri: redirectURI,
                    client_id: settings.clientId,
                    client_secret: settings.clientSecret,
                  }),
                });
                if (!response.ok)
                  throw new Error('Casdoor token exchange failed.');
                const body = (await response.json()) as Record<string, unknown>;
                // Meeting never needs provider access or refresh tokens.
                return {
                  idToken:
                    typeof body.id_token === 'string'
                      ? body.id_token
                      : undefined,
                };
              },
              getUserInfo: async ({ idToken }) => {
                // For callback tokens, Better Auth verifies JWKS, discovery issuer, clientId,
                // exp/iat and the nonce tied to state before this hook. It can still call the
                // hook with no ID token; never let that reach the shared identity helper.
                if (!idToken) return null;
                try {
                  const claims = decodeJwt(idToken);
                  const audience = Array.isArray(claims.aud)
                    ? claims.aud
                    : [claims.aud];
                  if (
                    claims.iss !== settings.issuer ||
                    typeof claims.sub !== 'string' ||
                    !claims.sub.trim() ||
                    audience.length !== 1 ||
                    audience[0] !== settings.clientId ||
                    (claims.azp !== undefined &&
                      claims.azp !== settings.clientId)
                  )
                    return null;
                  const container = app()?.container;
                  if (!container) return null;
                  const profile = await ensureCasdoorBrowserIdentity({
                    issuer: settings.issuer,
                    subject: claims.sub,
                    attributes: claims,
                    auth: container.resolve(authenticationToken),
                    provisioning: container.resolve(casdoorIdentityAdminToken)
                      .provisioning,
                    requireExistingBinding: true,
                    allowLocalUser: async (id) => {
                      const user = await container
                        .resolve(userAdministrationServiceToken)
                        .get(id);
                      if (
                        !user ||
                        user.kind !== 'person' ||
                        user.disabledAt !== null
                      )
                        return false;
                      const authorization =
                        container.resolve(authorizationToken);
                      const principal = { type: 'user', id };
                      const subjects =
                        await authorization.subjects.resolveFor(principal);
                      const access = await authorization
                        .for({
                          principal,
                          subjects: [
                            { type: 'authenticated', id: '*' },
                            ...subjects,
                          ],
                        })
                        .snapshot();
                      return !access.unrestricted;
                    },
                  });
                  return { ...profile, sub: claims.sub };
                } catch {
                  // Do not expose account, admission, or token details to the browser.
                  return null;
                }
              },
            },
          ],
        });
        const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const initialized = await Promise.race([
          plugin.init(context),
          new Promise<never>((_, reject) => {
            timeout.addEventListener(
              'abort',
              () => reject(new Error('Casdoor discovery timed out.')),
              { once: true },
            );
          }),
        ]);
        const provider = initialized.context.socialProviders.find(
          ({ id }) => id === CASDOOR_OAUTH_PROVIDER_ID,
        );
        if (
          !provider?.requiresIdTokenNonce ||
          provider.issuer !== settings.issuer
        )
          throw new Error(
            'Casdoor provider did not initialize with the configured issuer and nonce binding.',
          );
        // genericOAuth must initialize discovery to enable native verification. Only use endpoints
        // from our previously validated metadata, even if that second discovery response changed.
        provider.idToken = {
          issuer: settings.issuer,
          audience: settings.clientId,
          algorithms: ['RS256'],
          jwks: createRemoteJWKSet(new URL(metadata.jwks_uri), {
            timeoutDuration: REQUEST_TIMEOUT_MS,
          }),
        };
        provider.refreshAccessToken = undefined;
        return {
          context: { socialProviders: initialized.context.socialProviders },
        };
      } catch {
        context.logger.warn(
          'Casdoor discovery is unavailable or invalid; Meeting browser sign-in is disabled until restart.',
        );
        return {};
      }
    },
  };
}
