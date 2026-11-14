import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentAuthorizationConfig } from '@nocobase/app-plugin-agent-authorization/server';

/**
 * Audience for agent access tokens. `AGENT_AUTHORIZATION_AUDIENCE` wins;
 * otherwise the application's public origin is used.
 */
const agentAuthorization: AppConfigFactory<AgentAuthorizationConfig> =
  defineAppConfig({
    defaults: () => {
      const audience =
        process.env.AGENT_AUTHORIZATION_AUDIENCE?.trim() ||
        process.env.APP_PUBLIC_ORIGIN?.trim() ||
        undefined;
      if (!audience) return {};
      return { audience, issuer: audience };
    },
    env: {
      AGENT_AUTHORIZATION_AUDIENCE: envString('audience', {
        required: false,
        description:
          'Audience for agent access tokens. Defaults to APP_PUBLIC_ORIGIN when unset.',
      }),
    },
  });

export default agentAuthorization;
