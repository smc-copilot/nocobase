import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { IdentityHubAuthorizationProvider } from '../authorization.js';
import { IdentityHubProvider } from './identity-hub.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  IdentityHubProvider,
  IdentityHubAuthorizationProvider,
];

export default serviceProviders;
