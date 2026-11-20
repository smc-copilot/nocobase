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

const CLI_CLIENT_IDS: readonly string[] = ['nocobase-cli'];

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

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: () => {
    const casdoor = resolveCasdoorOAuthConfig();
    return {
      plugins: [
        username({ displayUsername: false }),
        apiKey(),
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
