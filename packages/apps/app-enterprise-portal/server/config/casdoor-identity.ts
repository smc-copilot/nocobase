import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { CasdoorIdentityConfig } from '@nocobase/app-plugin-casdoor-identity/server';

type CasdoorIdentityAppConfig = CasdoorIdentityConfig & {
  readonly browserSignIn?: boolean;
};

const casdoorIdentity: AppConfigFactory<CasdoorIdentityAppConfig> =
  defineAppConfig({
    defaults: () => {
      const issuer = process.env.CASDOOR_ISSUER?.trim();
      const clientId = process.env.CASDOOR_CLIENT_ID?.trim();
      const clientSecret = process.env.CASDOOR_CLIENT_SECRET?.trim();
      const audience = process.env.CASDOOR_AUDIENCE?.trim();
      const browserSignIn = Boolean(issuer && clientId && clientSecret);
      return {
        ...(issuer
          ? {
              issuer,
              jwksUri: `${issuer}/.well-known/jwks`,
            }
          : {}),
        ...(audience ? { audience } : {}),
        browserSignIn,
        mappablePermissionSets: [],
      };
    },
    public: ['browserSignIn'],
    env: {
      CASDOOR_ISSUER: envString('issuer', {
        required: false,
        description:
          'Casdoor issuer URL shared by JWT verification and browser OIDC discovery.',
      }),
      CASDOOR_AUDIENCE: envString('audience', {
        required: false,
        description: 'Expected JWT audience claim for Casdoor access tokens.',
      }),
      CASDOOR_JWKS_URI: envString('jwksUri', {
        required: false,
        description:
          'Absolute JWKS URL. Defaults to {CASDOOR_ISSUER}/.well-known/jwks when unset.',
      }),
    },
  });

export default casdoorIdentity;
