import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { CASDOOR_ACCESS_TOKEN_SCHEME } from '@nocobase/app-plugin-casdoor-identity/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineRootRoutes,
  describeRoute,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { ProtocolError, protocolErrorBody } from '../errors.js';
import { businessUiAdapterServiceToken } from '../tokens.js';

type Env = { Variables: AuthEnv['Variables'] };

const tags = ['BusinessUiProtocol'];

/** Session cookie or Casdoor resource access token (scoped credential). */
const userSecurity: Array<Record<string, string[]>> = [
  { cookieAuth: [] },
  { [CASDOOR_ACCESS_TOKEN_SCHEME]: [] },
];

function bearer(context: Context): string | undefined {
  return context.req.header('authorization') ?? undefined;
}

async function runProtocol(
  context: Context,
  run: () => Promise<Response | Record<string, unknown>>,
): Promise<Response> {
  try {
    const result = await run();
    if (result instanceof Response) return result;
    return context.json(result);
  } catch (error) {
    if (error instanceof ProtocolError) {
      return context.json(protocolErrorBody(error), error.status as 400);
    }
    throw error;
  }
}

/**
 * Octop business-ui.v1 protocol surface, mounted per connection.
 * Responses are top-level JSON (or HTML for redeem), not `{ data }`.
 */
export const protocolRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    if (
      !container.has(businessUiAdapterServiceToken) ||
      !container.has(authenticationToken)
    ) {
      return router;
    }

    const services = () => container.resolve(businessUiAdapterServiceToken);
    const auth = container.resolve(authenticationToken);
    const routes = new Hono<Env>();

    routes.post('/handshake', (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        const body = (await context.req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        return services().handshake(connectionId, bearer(context), {
          protocol:
            typeof body.protocol === 'string' ? body.protocol : undefined,
          destructive:
            typeof body.destructive === 'boolean'
              ? body.destructive
              : undefined,
          instance_issuer:
            typeof body.instance_issuer === 'string'
              ? body.instance_issuer
              : undefined,
        });
      }),
    );

    // Browser-only OAuth handoff; not a scriptable management API.
    routes.get('/oauth/callback', (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        return services().oauthCallback(connectionId, {
          code: context.req.query('code'),
          state: context.req.query('state'),
        });
      }),
    );

    routes.post('/oauth/consume', (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        const body = (await context.req.json().catch(() => ({}))) as {
          state?: string;
        };
        return services().oauthConsume(connectionId, bearer(context), body);
      }),
    );

    routes.post(
      '/tickets',
      describeRoute({
        tags,
        summary: 'Issue a one-time business-ui embed ticket',
        operationId: 'businessUiIssueTicket',
        security: [...userSecurity],
      }),
      auth.required({ scopedKeys: true }),
      (context) =>
        runProtocol(context, async () => {
          const connectionId = context.req.param('connectionId')!;
          const userId = context.get('auth')!.user.id;
          const body = (await context.req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          return services().issueTicket(connectionId, userId, body);
        }),
    );

    // Browser embed entry: returns HTML and Set-Cookie; not OpenAPI-documented management API.
    // Octop posts `application/x-www-form-urlencoded`; JSON remains accepted for tests.
    routes.post('/tickets/redeem', (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        const contentType = context.req.header('content-type') ?? '';
        let body: { ticket?: string; nonce?: string };
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const form = await context.req.parseBody();
          body = {
            ticket: typeof form.ticket === 'string' ? form.ticket : undefined,
            nonce: typeof form.nonce === 'string' ? form.nonce : undefined,
          };
        } else {
          body = (await context.req.json().catch(() => ({}))) as {
            ticket?: string;
            nonce?: string;
          };
        }
        const result = await services().redeemTicket(
          connectionId,
          body,
          context.req.raw,
        );
        const headers = new Headers({
          'content-type': 'text/html; charset=utf-8',
        });
        if (result.frameAncestors.length > 0) {
          headers.set(
            'content-security-policy',
            `frame-ancestors ${result.frameAncestors.join(' ')}`,
          );
        }
        for (const cookie of result.setCookies) {
          headers.append('set-cookie', cookie);
        }
        return new Response(result.html, { status: 200, headers });
      }),
    );

    // Session-only: embed cookie from redeem; Casdoor resource tokens must not substitute.
    routes.post('/documents/save', auth.required(), (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        const session = context.get('auth')!;
        const body = (await context.req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        return services().saveDocument(
          connectionId,
          session.user.id,
          session.session.id,
          body,
        );
      }),
    );

    routes.post('/documents/submit', auth.required(), (context) =>
      runProtocol(context, async () => {
        const connectionId = context.req.param('connectionId')!;
        const session = context.get('auth')!;
        const body = (await context.req.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        return services().submitDocument(
          connectionId,
          session.user.id,
          session.session.id,
          body,
        );
      }),
    );

    routes.post(
      '/interactions/:interactionId',
      describeRoute({
        tags,
        summary: 'Query the latest interaction receipt projection',
        operationId: 'businessUiGetInteraction',
        security: [...userSecurity],
      }),
      auth.required({ scopedKeys: true }),
      (context) =>
        runProtocol(context, async () => {
          const connectionId = context.req.param('connectionId')!;
          const interactionId = context.req.param('interactionId');
          return services().getInteraction(
            connectionId,
            context.get('auth')!.user.id,
            interactionId,
          );
        }),
    );

    routes.post(
      '/operations/:operationId',
      describeRoute({
        tags,
        summary: 'Query an operation and its receipt',
        operationId: 'businessUiQueryOperation',
        security: [...userSecurity],
      }),
      auth.required({ scopedKeys: true }),
      (context) =>
        runProtocol(context, async () => {
          const connectionId = context.req.param('connectionId')!;
          const operationId = context.req.param('operationId');
          return services().queryOperation(
            connectionId,
            context.get('auth')!.user.id,
            operationId,
          );
        }),
    );

    routes.post(
      '/operations/:operationId/retry',
      describeRoute({
        tags,
        summary: 'Retry a failed safe-retry operation',
        operationId: 'businessUiRetryOperation',
        security: [...userSecurity],
      }),
      auth.required({ scopedKeys: true }),
      (context) =>
        runProtocol(context, async () => {
          const connectionId = context.req.param('connectionId')!;
          const operationId = context.req.param('operationId');
          return services().retryOperation(
            connectionId,
            context.get('auth')!.user.id,
            operationId,
          );
        }),
    );

    routes.all('/forms/resolve', (context) =>
      context.json(
        protocolErrorBody(
          new ProtocolError(
            'UNSUPPORTED',
            400,
            'forms/resolve has no frozen external schema in this release',
          ),
        ),
        400,
      ),
    );

    return router.route('/business-ui/connections/:connectionId/v1', routes);
  });
