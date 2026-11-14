import { createAuditService } from './audit.js';
import { createClientService } from './clients.js';
import { createGrantService } from './grants.js';
import { createOAuthService } from './oauth.js';
import type {
  AgentAuthorizationServices,
  CreateServicesOptions,
} from './types.js';

export type {
  AgentAuthorizationServices,
  AgentClientCreated,
  AgentClientView,
  AgentGrantView,
  CreateClientInput,
  ResolvedAccessToken,
  TokenResponse,
  UpdateClientInput,
} from './types.js';

export function createAgentAuthorizationServices(
  options: CreateServicesOptions,
): AgentAuthorizationServices {
  const clients = createClientService(options.database);
  const grants = createGrantService(options.database);
  const oauth = createOAuthService({
    database: options.database,
    config: options.config,
    clients,
    grants,
  });
  const audit = createAuditService(options.database);

  return {
    clients,
    grants,
    oauth,
    audit,
    config: options.config,
  };
}
