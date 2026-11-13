import type { AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import {
  bearer,
  deviceAuthorization,
  genericOAuth,
  username,
} from 'better-auth/plugins';

/**
 * The command-line clients that may sign in through the browser (`deviceAuthorization()`): `nocobase-cli`, the id
 * `@nocobase/app-cli-client` sends unless a branded CLI names its own. Add the id of any other CLI that should sign in.
 */
const CLI_CLIENT_IDS: readonly string[] = ['nocobase-cli'];

/**
 * Casdoor browser sign-in (Better Auth `genericOAuth`). Absent means local admin / password only.
 * When any of the three is set, all three are required — incomplete enterprise config must fail closed.
 */
function resolveCasdoorOAuthConfig():
  | {
      readonly issuer: string;
      readonly clientId: string;
      readonly clientSecret: string;
    }
  | undefined {
  const issuer = process.env.CASDOOR_ISSUER?.trim();
  const clientId = process.env.CASDOOR_CLIENT_ID?.trim();
  const clientSecret = process.env.CASDOOR_CLIENT_SECRET?.trim();
  const present = [issuer, clientId, clientSecret].filter(Boolean).length;
  if (present === 0) return undefined;
  if (present < 3 || !issuer || !clientId || !clientSecret) {
    throw new Error(
      'CASDOOR_ISSUER, CASDOOR_CLIENT_ID and CASDOOR_CLIENT_SECRET must all be set together to enable Casdoor browser sign-in.',
    );
  }
  return { issuer, clientId, clientSecret };
}

// Select a named sender with passwordReset.mailer; defineAuthConfig retains AUTH_EMAIL_* for legacy inline senders.
// Automatic recovery requires passwordReset.enabled: true; leave the switch absent for custom callback compatibility.
const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: () => {
    const casdoor = resolveCasdoorOAuthConfig();
    return {
      plugins: [
        username({ displayUsername: false }),
        apiKey(),
        // A CLI signs in through the browser (RFC 8628): it shows a code the person approves on `/device`, below the
        // application's base path, and receives a session token it sends as `Authorization: Bearer` (`bearer()`).
        deviceAuthorization({
          verificationUri: '/device',
          expiresIn: '10m',
          interval: '5s',
          validateClient: (clientId) => CLI_CLIENT_IDS.includes(clientId),
        }),
        bearer(),
        ...(casdoor
          ? [
              genericOAuth({
                config: [
                  {
                    providerId: 'casdoor',
                    clientId: casdoor.clientId,
                    clientSecret: casdoor.clientSecret,
                    discoveryUrl: `${casdoor.issuer}/.well-known/openid-configuration`,
                    scopes: ['openid', 'profile', 'email'],
                    pkce: true,
                    // Admission owns who gets a local account; the browser flow must not invent one.
                    disableImplicitSignUp: true,
                  },
                ],
              }),
            ]
          : []),
      ],
      emailAndPassword: { enabled: true, autoSignIn: true },
      session: { storeSessionInDatabase: true },
      account: {
        encryptOAuthTokens: true,
        // SEC-03: never merge a Casdoor login into a local account that merely shares an e-mail address.
        accountLinking: { enabled: false },
      },
    };
  },
});

export default auth;
