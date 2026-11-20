import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  CASDOOR_APPLICATION_OWNER_ENV,
  CASDOOR_CLIENT_ID_ENV,
  CASDOOR_CLIENT_SECRET_ENV,
  CASDOOR_ENDPOINT_ENV,
  CASDOOR_ORGANIZATION_ENV,
  CASDOOR_PERMISSION_OWNER_ENV,
  type EnterpriseAppPortalConfig,
} from '@superice/app-plugin-enterprise-app-portal/server';

/**
 * Isolation default: `contractFixture` so local screenshots can show authorized
 * cards without a live Casdoor. Production must set `access.source` to a proven
 * Casdoor contract or leave it `unconfigured` (fail closed).
 */
const enterpriseAppPortal: AppConfigFactory<EnterpriseAppPortalConfig> =
  defineAppConfig({
    defaults: () => ({
      launchHostAllowlist: [
        'copilot.superic.com',
        'superic.com',
        'app.superice.com',
        'app.superic.com',
      ],
      launchAllowHttp: true,
      launchAllowPrivateDns: true,
      access: {
        source: 'managementApi',
        managementApi: {
          auth: 'query',
          organization: 'smartcore',
          applicationOwner: 'admin',
          permissionOwner: 'smartcore',
        },
      },
    }),
    env: {
      [CASDOOR_ENDPOINT_ENV]: envString('access.managementApi.endpoint', {
        required: false,
        description:
          'Casdoor origin for portal management calls, without an /api suffix.',
      }),
      [CASDOOR_ORGANIZATION_ENV]: envString(
        'access.managementApi.organization',
        {
          required: false,
          description:
            'Casdoor organization that owns portal users and permissions.',
        },
      ),
      [CASDOOR_APPLICATION_OWNER_ENV]: envString(
        'access.managementApi.applicationOwner',
        {
          required: false,
          description:
            'Owner of Casdoor application records. Defaults to admin.',
        },
      ),
      [CASDOOR_PERMISSION_OWNER_ENV]: envString(
        'access.managementApi.permissionOwner',
        {
          required: false,
          description:
            'Owner of portal Permission records. Defaults to the organization.',
        },
      ),
      [CASDOOR_CLIENT_ID_ENV]: envString('access.managementApi.clientId', {
        required: false,
        secret: true,
        description:
          'Casdoor application client id used for management API calls. Not a committed secret.',
      }),
      [CASDOOR_CLIENT_SECRET_ENV]: envString(
        'access.managementApi.clientSecret',
        {
          required: false,
          secret: true,
          description:
            'Casdoor application client secret used for management API calls. Never commit it.',
        },
      ),
    },
  });

export default enterpriseAppPortal;
