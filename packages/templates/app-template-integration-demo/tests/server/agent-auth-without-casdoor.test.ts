// @vitest-environment node
/**
 * A01: the Demo agent-authorization and business UI adapter chain boots when
 * Casdoor is omitted from the server plugin list and no Casdoor config is set.
 * Production Demo still registers Casdoor as an optional login source.
 */
import path from 'node:path';

import { agentAuthorizationServiceToken } from '@nocobase/app-plugin-agent-authorization/server/tokens';
import { businessUiAdapterServiceToken } from '@nocobase/app-plugin-business-ui-adapter/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { defineStandaloneServer } from '@nocobase/app-server/node';
import { defineServerPlugins } from '@nocobase/app-server/plugins';
import {
  defineAppRuntime,
  resolveAppRuntime,
  startApplicationInScope,
  type AppScope,
} from '@nocobase/app-server/runtime';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createApp } from '../../server/app.js';
import serverPlugins from '../../server/plugins.ts';
import appRuntime from '../../server/runtime.js';

const CASDOOR = '@nocobase/app-plugin-casdoor-identity';
const CASDOOR_COLLECTIONS = [
  'externalIdentities',
  'identityProviders',
  'identityMappingRules',
  'managedPermissionAssignments',
  'identitySyncRuns',
  'businessUiSubjectBindings',
  'identityAuditEvents',
] as const;

const pluginsWithoutCasdoor = defineServerPlugins(
  serverPlugins.plugins.filter((plugin) => plugin.packageName !== CASDOOR),
);

const runtimeWithoutCasdoor = defineAppRuntime({
  ...(appRuntime.deploymentRootDir
    ? { deploymentRootDir: appRuntime.deploymentRootDir }
    : {}),
  createAppConfig: appRuntime.createAppConfig,
  ...(appRuntime.defaultConfigs
    ? { defaultConfigs: appRuntime.defaultConfigs }
    : {}),
  plugins: pluginsWithoutCasdoor,
  serviceProviders: appRuntime.serviceProviders,
  routes: appRuntime.routes,
  ...(appRuntime.locales ? { locales: appRuntime.locales } : {}),
});

async function createServerWithoutCasdoor(
  scope: AppScope,
): Promise<Application> {
  const runtime = await resolveAppRuntime(runtimeWithoutCasdoor, scope);
  return startApplicationInScope(scope, createApp(runtime));
}

const createStandaloneWithoutCasdoor = defineStandaloneServer({
  rootDir: path.resolve(import.meta.dirname, '../..'),
  appRuntime: runtimeWithoutCasdoor,
  createServer: createServerWithoutCasdoor,
}).create;

const test = createAppTest({
  createServer: createStandaloneWithoutCasdoor,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

test('boots agent authorization and the adapter with no Casdoor plugin or tables', async ({
  app,
  expectCollection,
}) => {
  const names = pluginsWithoutCasdoor.plugins.map(
    (plugin) => plugin.packageName,
  );
  expect(names).toContain('@nocobase/app-plugin-agent-authorization');
  expect(names).toContain('@nocobase/app-plugin-business-ui-adapter');
  expect(names).not.toContain(CASDOOR);
  expect(
    names.indexOf('@nocobase/app-plugin-business-ui-adapter'),
  ).toBeGreaterThan(names.indexOf('@nocobase/app-plugin-agent-authorization'));

  expect(app.container.has(agentAuthorizationServiceToken)).toBe(true);
  expect(app.container.has(businessUiAdapterServiceToken)).toBe(true);
  const agent = app.container.resolve(agentAuthorizationServiceToken);
  const adapter = app.container.resolve(businessUiAdapterServiceToken);
  const client = await agent.clients.create({
    name: 'No Casdoor',
    redirectUris: ['http://localhost:8090/cb'],
    allowedScopes: ['business-ui:view'],
  });
  expect(client.clientSecret).toEqual(expect.any(String));
  await adapter.upsertConnection({
    connectionId: 'no-casdoor',
    octopIssuer: 'https://octop.no-casdoor.test',
    allowedOrigins: ['https://octop.no-casdoor.test'],
    serviceSecret: 'connection-service-secret',
    clientId: client.clientId,
    enabled: true,
  });
  const handshake = await adapter.handshake(
    'no-casdoor',
    'Bearer connection-service-secret',
    {
      protocol: 'business-ui.v1',
      destructive: false,
      instance_issuer: 'https://octop.no-casdoor.test',
    },
  );
  expect(handshake).toMatchObject({
    ok: true,
    protocol: 'business-ui.v1',
  });

  for (const name of CASDOOR_COLLECTIONS) {
    await expectCollection(name).not.toExist();
  }
});
