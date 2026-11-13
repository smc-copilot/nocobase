import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { BusinessUiAdapterConfig } from '@nocobase/app-plugin-business-ui-adapter/server';

const businessUiAdapter: AppConfigFactory<BusinessUiAdapterConfig> =
  defineAppConfig({
    defaults: {
      environment: 'development',
    },
    env: {
      BUSINESS_UI_ENVIRONMENT: envString('environment', {
        required: false,
        description:
          'Environment label returned by business-ui.v1 handshake (for example development or test).',
      }),
      BUSINESS_UI_PUBLIC_BASE_URL: envString('publicBaseUrl', {
        required: false,
        description:
          'Public origin the adapter advertises for embed and callback URLs.',
      }),
    },
  });

export default businessUiAdapter;
