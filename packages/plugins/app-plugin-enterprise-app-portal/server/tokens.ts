import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { EnterprisePortalServices } from './services/composition.js';

export const enterprisePortalServiceToken: ServiceToken<EnterprisePortalServices> =
  createServiceToken<EnterprisePortalServices>(
    '@superice/app-plugin-enterprise-app-portal/services',
  );
