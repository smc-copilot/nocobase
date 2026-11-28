import {
  defineAppConfig,
  envBoolean,
  envString,
} from '@nocobase/app-server/config';
import type { CasdoorIdentityConfig } from '@nocobase/app-plugin-casdoor-identity/server';

export interface MeetingCasdoorBrowserConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

function canonicalHttpsIssuer(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !value.endsWith('/') &&
      value === `${url.origin}${url.pathname === '/' ? '' : url.pathname}`
    );
  } catch {
    return false;
  }
}

export function readMeetingCasdoorBrowserConfig(
  env: Readonly<Record<string, string | undefined>>,
): MeetingCasdoorBrowserConfig | undefined {
  if (env.CASDOOR_BROWSER_SIGN_IN_ENABLED?.trim() !== 'true') return;
  const issuer = env.CASDOOR_ISSUER?.trim();
  const clientId = env.CASDOOR_CLIENT_ID?.trim();
  const clientSecret = env.CASDOOR_CLIENT_SECRET?.trim();
  if (issuer && canonicalHttpsIssuer(issuer) && clientId && clientSecret)
    return { issuer, clientId, clientSecret };
}

type MeetingCasdoorIdentityConfig = CasdoorIdentityConfig & {
  readonly browserSignIn: boolean;
};

export default defineAppConfig<MeetingCasdoorIdentityConfig>({
  defaults: ({ env }) => ({
    browserSignIn: Boolean(readMeetingCasdoorBrowserConfig(env)),
    accessTokenEnabled: false,
    mappablePermissionSets: [],
    sync: { enabled: false },
  }),
  public: ['browserSignIn'],
  // Browser settings are resolved from the scoped environment above, not from provider records or YAML overrides.
  env: {
    CASDOOR_BROWSER_SIGN_IN_ENABLED: envBoolean('browser.enabled', {
      required: false,
      description:
        'Opt in to Meeting browser sign-in with Casdoor; off by default.',
    }),
    CASDOOR_ISSUER: envString('browser.issuer', {
      required: false,
      description: 'Canonical HTTPS Casdoor OIDC issuer (no trailing slash).',
    }),
    CASDOOR_CLIENT_ID: envString('browser.clientId', {
      required: false,
      description: 'Dedicated Meeting Casdoor OIDC client ID.',
    }),
    CASDOOR_CLIENT_SECRET: envString('browser.clientSecret', {
      required: false,
      description: 'Dedicated Meeting Casdoor OIDC client secret.',
      secret: true,
    }),
  },
  validate: (value, context) => {
    if (context.isUserProvided('browserSignIn'))
      context.error(
        'browserSignIn',
        'This flag is derived from the Casdoor environment variables.',
      );
    if (value.accessTokenEnabled !== false || value.issuer || value.audience)
      context.error(
        'accessTokenEnabled',
        'Meeting does not accept Casdoor API tokens.',
      );
    if (value.mappablePermissionSets?.length || value.sync?.enabled !== false)
      context.error(
        'mappablePermissionSets',
        'Meeting does not map external permissions or sync its directory.',
      );
  },
});
