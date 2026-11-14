import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { AgentAuthorizationAuthorizationProvider } from '../authorization.js';
import { AgentAuthorizationProvider } from './agent-authorization.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  AgentAuthorizationProvider,
  AgentAuthorizationAuthorizationProvider,
];

export default serviceProviders;
