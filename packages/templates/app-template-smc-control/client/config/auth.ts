import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';
import { apiKeyClient } from '@nocobase/app-plugin-api-keys/client';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/client';
import {
  deviceAuthorizationClient,
  usernameClient,
} from 'better-auth/client/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  // `deviceAuthorizationClient()` serves the `/device` page (`pages/auth/device.tsx`), where people approve a CLI's sign-in.
  // Casdoor browser sign-in uses Better Auth 1.7.5 `genericOAuth` on the server, which registers as a social
  // provider — no separate client plugin; the login page calls `client.signIn.social({ provider: 'casdoor' })`.
  plugins: [
    usernameClient({ displayUsername: false }),
    apiKeyClient(),
    deviceAuthorizationClient(),
  ],
}));

export default auth;
