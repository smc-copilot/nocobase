import type { AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { createCasdoorBrowserOAuthConfig } from '@nocobase/app-plugin-casdoor-identity/server';
import {
  bearer,
  deviceAuthorization,
  genericOAuth,
  username,
} from 'better-auth/plugins';

import { oaLtpaAuth } from '../auth/oa-ltpa/plugin.js';

/**
 * The command-line clients that may sign in through the browser (`deviceAuthorization()`): `nocobase-cli`, the id
 * `@nocobase/app-cli-client` sends unless a branded CLI names its own. Add the id of any other CLI that should sign in.
 */
const CLI_CLIENT_IDS: readonly string[] = ['nocobase-cli'];

/** Letters in any language, digits, underscore, dot, or hyphen. Length is enforced by the username plugin. */
export function isMeetingUsername(username: string): boolean {
  return /^[\p{L}\p{N}_.-]+$/u.test(username);
}

/**
 * Casdoor browser OAuth. Independent of OA LTPA: both can be registered, and neither
 * implies the other. All three values are required together; a partial set fails startup.
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
        username({
          displayUsername: false,
          // Sign-in names include employee ids (`smc-sz-hr21007`) and display
          // names written in any language. Better Auth's default allows only
          // ASCII letters, digits, `_` and `.`.
          usernameValidator: isMeetingUsername,
        }),
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
        // OA Ltpa SSO (PRD-MEETING-OA-SSO-001). Remains inert until meetingOaSso.enabled and validateUrl are set.
        oaLtpaAuth(),
        ...(casdoor
          ? [
              genericOAuth({
                config: [
                  createCasdoorBrowserOAuthConfig({
                    issuer: casdoor.issuer,
                    clientId: casdoor.clientId,
                    clientSecret: casdoor.clientSecret,
                  }),
                ],
              }),
            ]
          : []),
      ],
      emailAndPassword: { enabled: true, autoSignIn: true },
      session: { storeSessionInDatabase: true },
      account: {
        encryptOAuthTokens: true,
        accountLinking: { enabled: false },
      },
    };
  },
});

export default auth;
