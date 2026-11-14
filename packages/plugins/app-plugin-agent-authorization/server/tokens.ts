import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AgentAuthorizationServices } from './services/index.js';

export const agentAuthorizationServiceToken: ServiceToken<AgentAuthorizationServices> =
  createServiceToken<AgentAuthorizationServices>(
    '@nocobase/app-plugin-agent-authorization/services',
  );
