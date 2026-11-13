import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ProtocolServices } from './services/protocol.js';

export type BusinessUiAdapterService = ProtocolServices;

export const businessUiAdapterServiceToken: ServiceToken<BusinessUiAdapterService> =
  createServiceToken<BusinessUiAdapterService>(
    '@nocobase/app-plugin-business-ui-adapter/service',
  );
