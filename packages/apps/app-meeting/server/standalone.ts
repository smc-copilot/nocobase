import path from 'node:path';

import {
  defineStandaloneServer,
  startNodeAppServer,
  type StandaloneServer as CoreStandaloneServer,
  type StandaloneServerOptions as CoreStandaloneServerOptions,
} from '@nocobase/app-server/node';

import { createServer } from './embedded.js';
import appRuntime from './runtime.js';

const standalone = defineStandaloneServer({
  rootDir: path.resolve(import.meta.dirname, '..'),
  appRuntime,
  createServer,
});

export type StandaloneServer = CoreStandaloneServer;

export type StandaloneServerOptions = CoreStandaloneServerOptions;

/**
 * Gateway continue_to is `{ALLOWED_ORIGIN}/meetings/done` (no basePath). The
 * session cookie is scoped to publicBasePath, so redirect into the mounted app
 * while preserving flow_nonce.
 */
function withMeetingsDoneRedirect(server: StandaloneServer): StandaloneServer {
  const publicBasePath = (server.application.publicBasePath || '').replace(
    /\/$/,
    '',
  );
  const innerFetch = server.fetch.bind(server);
  return {
    ...server,
    fetch: (request, env, executionContext) => {
      const url = new URL(request.url);
      if (
        url.pathname === '/meetings/done' ||
        url.pathname === '/meetings/done/'
      ) {
        const location = `${publicBasePath}/meetings/done${url.search}`;
        return new Response(null, {
          status: 302,
          headers: { Location: location || `/meetings/done${url.search}` },
        });
      }
      return innerFetch(request, env, executionContext);
    },
  };
}

export const createStandaloneServer: (
  options?: StandaloneServerOptions,
) => Promise<StandaloneServer> = async (options) =>
  withMeetingsDoneRedirect(await standalone.create(options));

export const startServer: (options?: StandaloneServerOptions) => void = (
  options,
) => {
  void (async () => {
    const app = await createStandaloneServer(options);
    try {
      await startNodeAppServer(app, {
        ...app.shutdownOptions,
        hostname: app.listenOptions.hostname,
        port: app.listenOptions.port,
        onListen: (info): void => {
          if (!app.listenOptions.startLog) return;
          console.log(
            `App server listening on http://${info.address}:${info.port}`,
          );
        },
      });
    } catch (error) {
      await app.close();
      throw error;
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
};

if (import.meta.main) startServer();
