// @vitest-environment node
/**
 * Gate A N28: real SMC Control boot — migrations, providers, routes assembled;
 * raw HTTP + undeclared-route check.
 */
import { findUndeclaredApiRoutes } from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

test('boots Control with migrations and declares every /api route (N28)', async ({
  app,
  request,
}) => {
  expect(findUndeclaredApiRoutes(app)).toEqual([]);

  const health = await request('/healthz');
  expect(health.status).toBe(200);

  const swagger = await request('/swagger');
  expect(swagger.status).toBeLessThan(500);
});
