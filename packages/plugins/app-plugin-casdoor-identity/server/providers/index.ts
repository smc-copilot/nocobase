import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { CasdoorIdentityProvider } from './casdoor-identity.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  CasdoorIdentityProvider,
];

export default serviceProviders;
