import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { IdentityDirectory } from './directory.js';
import type { IdentityServices } from './identity/services.js';
import type { DefaultCasdoorIdentityService } from './services/casdoor-identity.js';

export type CasdoorIdentityService = DefaultCasdoorIdentityService;

export const casdoorIdentityServiceToken: ServiceToken<CasdoorIdentityService> =
  createServiceToken<CasdoorIdentityService>(
    '@nocobase/app-plugin-casdoor-identity/service',
  );

/** Provisioning, mapping, sync, subject pre-binding and audit services. */
export const casdoorIdentityAdminToken: ServiceToken<IdentityServices> =
  createServiceToken<IdentityServices>(
    '@nocobase/app-plugin-casdoor-identity/admin',
  );

/**
 * Optional override for where periodic sync reads users from. When an application registers
 * this token the plugin uses it instead of building a Casdoor client from `casdoorIdentity.directory`.
 */
export const identityDirectoryToken: ServiceToken<IdentityDirectory> =
  createServiceToken<IdentityDirectory>(
    '@nocobase/app-plugin-casdoor-identity/directory',
  );
