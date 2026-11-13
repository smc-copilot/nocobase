import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { CasdoorIdentityAuthorizationProvider } from '../authorization.js';
import { CasdoorIdentityProvider } from './casdoor-identity.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  CasdoorIdentityProvider,
  CasdoorIdentityAuthorizationProvider,
];

export default serviceProviders;
