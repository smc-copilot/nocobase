# Wiring Casdoor browser sign-in with `genericOAuth`

This guide shows how an application adds Casdoor as a browser sign-in method next to the JWT credential resolver this plugin registers. It is documentation only: the application templates are not wired yet, because the wiring depends on the `smc-control` application landing first, and an `auth.ts` edit that has not run against a live Casdoor would be a guess.

## Two entry paths, one identity

Casdoor identities reach the application in two ways, and they do different jobs.

| Path                         | Mechanism                                                                         | Result                                                                |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| API and integration calls    | This plugin's credential resolver verifies a Casdoor access token with JWKS       | A scoped issued credential for the user bound in `externalIdentities` |
| Browser sign-in (this guide) | Better Auth's `genericOAuth` plugin runs the authorization-code flow with Casdoor | A native Better Auth session cookie and an `account` row for the user |

`externalIdentities` stays the stable key `(issuer, subject)` for admission, Permission Set mapping, sync and Octop subject pre-binding. The first-login provisioning, admission policy and repeat-login reuse described in the plugin README run when a Casdoor JWT reaches the resolver.

## 1. Register the provider

Follow the application's own `server/config/auth.ts`, keeping every plugin it already registers (`username`, `apiKey`, `deviceAuthorization`, `bearer`, and so on). Add `genericOAuth` to the `plugins` array and keep the secrets in the environment:

```ts
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import type { AppConfigFactory } from '@nocobase/app-server/config';
import { genericOAuth, username } from 'better-auth/plugins';

const issuer = process.env.CASDOOR_ISSUER; // for example https://sso.example.com
const clientId = process.env.CASDOOR_CLIENT_ID;
const clientSecret = process.env.CASDOOR_CLIENT_SECRET;
if (!issuer || !clientId || !clientSecret) {
  throw new Error(
    'CASDOOR_ISSUER, CASDOOR_CLIENT_ID and CASDOOR_CLIENT_SECRET are required.',
  );
}

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: {
    plugins: [
      username({ displayUsername: false }),
      // ...the plugins the application already registers...
      genericOAuth({
        config: [
          {
            providerId: 'casdoor',
            clientId,
            clientSecret,
            discoveryUrl: `${issuer}/.well-known/openid-configuration`,
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
            // The browser flow must not create accounts on its own: admission decides who gets one.
            disableImplicitSignUp: true,
          },
        ],
      }),
    ],
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { storeSessionInDatabase: true },
    account: {
      encryptOAuthTokens: true,
      // Never merge a Casdoor login into a local account that merely shares an e-mail address.
      accountLinking: { enabled: false },
    },
  },
});

export default auth;
```

Notes:

- `discoveryUrl`, `disableImplicitSignUp`, `disableSignUp`, `pkce` and `scopes` are `genericOAuth` options in the Better Auth version this repository resolves (1.7.5). Re-check the option names against the installed version when upgrading.
- `account.accountLinking` is a Better Auth `BetterAuthOptions` field that `AuthConfig` forwards. Confirm it against the installed types before relying on it; the intent is SEC-03, no automatic merge by e-mail.
- Map the three environment variables the way the application's other sections do (`env` in the section's `defineAppConfig`) and check them with `pnpm nocobase config env`. The client secret never reaches `client/` or a Vite variable.
- The same issuer value belongs in `casdoorIdentity.issuer`, with `casdoorIdentity.jwksUri` (`${issuer}/.well-known/jwks`) and `casdoorIdentity.audience`, so both paths trust one Casdoor.
- Register the redirect URI `<origin>/<base path>/api/auth/oauth2/callback/casdoor` in the Casdoor application. The base path is the application's runtime mount path.

## 2. Client counterpart

Add the client plugin to `client/config/auth.ts` and start the flow from a button:

```ts
import { genericOAuthClient } from 'better-auth/client/plugins';
// ...add genericOAuthClient() to the plugins of the auth client...

const { client } = useAuthentication();
await client.signIn.oauth2({
  providerId: 'casdoor',
  callbackURL: resolveAppUrl('/'),
});
```

Use `resolveAppUrl` from `@nocobase/app-client` for the callback so it follows the runtime mount path.

## 3. What this wiring does not do yet

The browser flow and the identity plugin are not joined until the `smc-control` merge, so state these gaps rather than assuming them:

- `genericOAuth` writes a Better Auth `account` row (`providerId = casdoor`, `accountId` = the Casdoor subject). It does not write `externalIdentities`, and it does not evaluate the provider's admission policy. With `disableImplicitSignUp` set, a Casdoor user without an existing local account cannot complete the browser flow.
- Until a post-login hook links the Better Auth `account` to an `externalIdentities` row, create the local user and binding through the JWT path (first login with a Casdoor access token) or through the subject binding import, and use the browser flow only for users who already have both.
- Disable and sync go through `UserAdministrationService`, which revokes Better Auth sessions, so a user disabled by the sync loses the browser session as well. Re-enabling does not bring the old session back; the user signs in again.

Verify any change to `server/config/auth.ts` against a live Casdoor before documenting it as working: first sign-in, repeat sign-in, a failed callback, sign-out, and a disabled user.
