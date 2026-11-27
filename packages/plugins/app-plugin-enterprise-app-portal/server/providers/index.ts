import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { EnterprisePortalAuthorizationProvider } from '../authorization.js';
import { EnterprisePortalProvider } from './enterprise-app-portal.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  EnterprisePortalProvider,
  EnterprisePortalAuthorizationProvider,
];

export default serviceProviders;
