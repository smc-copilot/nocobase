// @vitest-environment node
/**
 * Gate A N28: real Integration Demo boot — migrations, providers, routes,
 * Auth/Authorization assembled; raw HTTP + undeclared-route check.
 */
import { businessUiAdapterServiceToken } from '@nocobase/app-plugin-business-ui-adapter/server/tokens';
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const CONNECTION_ID = 'demo-site';
const SERVICE_SECRET = 'demo-connection-service-secret';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

test('boots Demo with migrations and declares every /api route (N28)', async ({
  app,
  testApp,
  request,
}) => {
  expect(findUndeclaredApiRoutes(app)).toEqual([]);

  const health = await request('/healthz');
  expect(health.status).toBe(200);

  const swagger = await request('/swagger');
  // Anonymous may be 401; the route must exist.
  expect(swagger.status).toBeLessThan(500);

  const services = app.container.resolve(businessUiAdapterServiceToken);
  await services.upsertConnection({
    connectionId: CONNECTION_ID,
    octopIssuer: 'https://octop.integration-demo.test',
    allowedOrigins: ['https://octop.integration-demo.test'],
    serviceSecret: SERVICE_SECRET,
    clientId: 'demo-agent-client',
    enabled: true,
  });

  const base = testApp.publicBasePath.replace(/\/$/, '');
  const handshake = await testApp.fetch(
    new Request(
      `http://localhost${base}/business-ui/connections/${CONNECTION_ID}/v1/handshake`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SERVICE_SECRET}`,
        },
        body: JSON.stringify({ protocol: 'business-ui.v1' }),
      },
    ),
  );
  expect(handshake.status).toBe(200);
  const body = (await handshake.json()) as { ok?: boolean; protocol?: string };
  expect(body).toMatchObject({ ok: true, protocol: 'business-ui.v1' });
});
