import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DefaultCasdoorIdentityService } from './services/casdoor-identity.js';

export type CasdoorIdentityService = DefaultCasdoorIdentityService;

export const casdoorIdentityServiceToken: ServiceToken<CasdoorIdentityService> =
  createServiceToken<CasdoorIdentityService>(
    '@nocobase/app-plugin-casdoor-identity/service',
  );
