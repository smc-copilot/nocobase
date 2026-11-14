// @vitest-environment node
/**
 * A01 start: agent authorization is part of the Demo boot and does not require
 * the adapter to import Casdoor. Casdoor remains registered as an optional login source.
 */
import { agentAuthorizationServiceToken } from '@nocobase/app-plugin-agent-authorization/server/tokens';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, it } from 'vitest';

import serverPlugins from '../../server/plugins.ts';
import { createStandaloneServer } from '../../server/standalone.js';

it('registers agent authorization before the business UI adapter', () => {
  const names = serverPlugins.plugins.map((plugin) => plugin.packageName);
  const agent = names.indexOf('@nocobase/app-plugin-agent-authorization');
  const adapter = names.indexOf('@nocobase/app-plugin-business-ui-adapter');
  expect(agent).toBeGreaterThanOrEqual(0);
  expect(adapter).toBeGreaterThan(agent);
});

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

test('loads the agent authorization service on boot', async ({ app }) => {
  expect(app.container.has(agentAuthorizationServiceToken)).toBe(true);
  const services = app.container.resolve(agentAuthorizationServiceToken);
  expect(services.grants.requireActive).toEqual(expect.any(Function));
  expect(services.clients.create).toEqual(expect.any(Function));
});
