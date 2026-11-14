import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { addBasePathToLocation } from '@nocobase/app-server/support';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';

import { ERROR_DOMAIN, SCOPES } from '../config.js';
import type { AgentAuthorizationServices } from '../services/index.js';
import { oauthError } from '../services/errors.js';

type Env = { Variables: AuthEnv['Variables'] };

const tags = ['AgentAuthorizationOAuth'];

const AuthorizeQuery = z.object({
  client_id: z.string().min(1).max(128),
  redirect_uri: z.string().url().max(1024),
  response_type: z.literal('code'),
  state: z.string().max(512).optional(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  scope: z.string().min(1).max(512),
});

const ConsentContextQuery = z.object({
  client_id: z.string().min(1).max(128),
  redirect_uri: z.string().url().max(1024).optional(),
  scope: z.string().max(512).optional(),
});

interface ConsentContextGrant {
  readonly grantId: string;
  readonly expiresAt: string | null;
  readonly status: string;
}

interface ConsentContextView {
  readonly clientId: string;
  readonly name: string;
  readonly instanceLabel: string | null;
  readonly audience: string;
  readonly requestedScopes: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly redirectUri: string | null;
  readonly enabled: boolean;
  readonly grant: ConsentContextGrant | null;
}

const ConsentContextSchema: z.ZodType<ConsentContextView> = z.object({
  clientId: z.string(),
  name: z.string(),
  instanceLabel: z.string().nullable(),
  audience: z.string(),
  requestedScopes: z.array(z.string()),
  allowedScopes: z.array(z.string()),
  redirectUri: z.string().nullable(),
  enabled: z.boolean(),
  grant: z
    .object({
      grantId: z.string(),
      expiresAt: z.string().nullable(),
      status: z.string(),
    })
    .nullable(),
});

const ConsentBody = z.strictObject({
  client_id: z.string().min(1).max(128),
  redirect_uri: z.string().url().max(1024),
  state: z.string().max(512).optional(),
  code_challenge: z.string().min(43).max(128),
  scope: z.string().min(1).max(512),
  decision: z.enum(['approve', 'deny']),
});

function parseScopes(scope: string): string[] {
  return scope
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateRequestedScopes(
  requested: readonly string[],
  allowed: readonly string[],
): void {
  const allow = new Set(allowed);
  const known = new Set<string>(SCOPES);
  for (const scope of requested) {
    if (!known.has(scope) || !allow.has(scope)) {
      throw oauthError('INVALID_SCOPE', `Scope not allowed: ${scope}`);
    }
  }
}

async function readTokenBody(
  context: Context,
): Promise<Record<string, string>> {
  const contentType = context.req.header('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await context.req.parseBody();
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  }
  const json = (await context.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function basicClientCredentials(
  header: string | undefined,
): { clientId: string; secret: string } | undefined {
  if (!header?.startsWith('Basic ')) return undefined;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    if (index < 0) return undefined;
    return {
      clientId: decodeURIComponent(decoded.slice(0, index)),
      secret: decodeURIComponent(decoded.slice(index + 1)),
    };
  } catch {
    return undefined;
  }
}

/**
 * Browser Location for a path inside this application. The mount layer also prefixes
 * `publicBasePath`, and skips a path that already carries it, so doing it here is safe.
 *
 * The `redirect` query value is the SPA path relative to the router basename.
 * `AuthenticationGuard` navigates with React Router, which prepends that basename itself.
 */
function browserLocation(
  publicBasePath: string,
  pathWithQuery: string,
): string {
  return addBasePathToLocation(pathWithQuery, publicBasePath);
}

function authorizeResumePath(requestUrl: string): string {
  const queryIndex = requestUrl.indexOf('?');
  const search = queryIndex === -1 ? '' : requestUrl.slice(queryIndex);
  return `/agent-authorization/authorize${search}`;
}

function redirectWithParams(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function createOAuthRouter(options: {
  services: () => AgentAuthorizationServices;
  authenticate: MiddlewareHandler;
  optionalAuthenticate: MiddlewareHandler;
  defaultAudience: () => string;
  publicBasePath: () => string;
}): Hono {
  const router = new Hono();
  router.onError((error, context) => apiErrorHandler(error, context));

  router.get(
    '/oauth/authorize',
    options.optionalAuthenticate,
    describeRoute({
      tags,
      summary: 'OAuth2 authorization endpoint (browser)',
      operationId: 'agentAuthorizationAuthorize',
      hide: true,
      responses: { 302: { description: 'Redirect to consent or client' } },
    }),
    async (context) => {
      const parsed = AuthorizeQuery.safeParse(context.req.query());
      if (!parsed.success) {
        throw oauthError('INVALID_REQUEST', 'Invalid authorize parameters');
      }
      const query = parsed.data;
      // Unauthenticated browsers go to native login. After sign-in the SPA recovery
      // page loads and performs a full navigation back to this API endpoint.
      const auth = (context as unknown as Context<Env>).get('auth');
      if (!auth?.user.id) {
        const resumePath = authorizeResumePath(context.req.url);
        return context.redirect(
          browserLocation(
            options.publicBasePath(),
            `/login?redirect=${encodeURIComponent(resumePath)}`,
          ),
        );
      }
      const services = options.services();
      const client = await services.clients.get(query.client_id);
      if (!client || !client.redirectUris.includes(query.redirect_uri)) {
        throw oauthError('INVALID_REQUEST', 'redirect_uri is not registered');
      }
      if (!client.enabled) {
        return context.redirect(
          redirectWithParams(query.redirect_uri, {
            error: 'unauthorized_client',
            state: query.state,
          }),
        );
      }
      const scopes = parseScopes(query.scope);
      validateRequestedScopes(scopes, client.allowedScopes);
      const grant = await services.grants.findActiveCovering({
        clientId: query.client_id,
        localUserId: auth.user.id,
        audience: options.defaultAudience(),
        scopes,
      });
      if (grant) {
        const code = await services.oauth.createAuthorizationCode({
          clientId: query.client_id,
          localUserId: auth.user.id,
          grantId: grant.id,
          redirectUri: query.redirect_uri,
          codeChallenge: query.code_challenge,
          scope: scopes.join(' '),
        });
        return context.redirect(
          redirectWithParams(query.redirect_uri, {
            code,
            state: query.state,
          }),
        );
      }
      const consent = new URLSearchParams({
        client_id: query.client_id,
        redirect_uri: query.redirect_uri,
        code_challenge: query.code_challenge,
        scope: query.scope,
        response_type: 'code',
        code_challenge_method: 'S256',
      });
      if (query.state) consent.set('state', query.state);
      return context.redirect(
        browserLocation(
          options.publicBasePath(),
          `/agent-authorization/consent?${consent.toString()}`,
        ),
      );
    },
  );

  router.get(
    '/oauth/consent-context',
    options.authenticate,
    describeRoute({
      tags,
      summary: 'Read consent display metadata for an agent client',
      operationId: 'agentAuthorizationConsentContext',
      responses: {
        200: dataResponse(ConsentContextSchema),
        404: apiErrorResponse(404, 'Client not found'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ConsentContextQuery),
    async (context) => {
      const query = context.req.valid('query');
      const userId = (context as unknown as Context<Env>).get('auth')?.user.id;
      if (!userId) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTH_REQUIRED',
          domain: ERROR_DOMAIN,
          message: 'Sign in required',
        });
      }
      const services = options.services();
      const client = await services.clients.get(query.client_id);
      if (!client) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'NOT_FOUND',
          domain: ERROR_DOMAIN,
          message: 'Client not found',
        });
      }
      const audience = options.defaultAudience();
      const requestedScopes = query.scope
        ? parseScopes(query.scope)
        : [...client.allowedScopes];
      const coveringScopes = requestedScopes.filter((scope) =>
        client.allowedScopes.includes(scope),
      );
      const grant =
        coveringScopes.length > 0
          ? await services.grants.findActiveCovering({
              clientId: client.clientId,
              localUserId: userId,
              audience,
              scopes: coveringScopes,
            })
          : undefined;
      const redirectUri =
        query.redirect_uri && client.redirectUris.includes(query.redirect_uri)
          ? query.redirect_uri
          : null;
      const data: ConsentContextView = {
        clientId: client.clientId,
        name: client.name,
        instanceLabel: client.instanceLabel,
        audience,
        requestedScopes,
        allowedScopes: [...client.allowedScopes],
        redirectUri,
        enabled: client.enabled,
        grant: grant
          ? {
              grantId: grant.id,
              expiresAt: grant.expiresAt?.toISOString() ?? null,
              status: grant.status,
            }
          : null,
      };
      return context.json({ data });
    },
  );

  router.post(
    '/oauth/consent',
    options.authenticate,
    describeRoute({
      tags,
      summary: 'Record user consent and issue authorization code',
      operationId: 'agentAuthorizationConsent',
      responses: {
        200: dataResponse(z.object({ redirectUri: z.string().url() })),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', ConsentBody),
    async (context) => {
      const body = context.req.valid('json');
      const userId = (context as unknown as Context<Env>).get('auth')?.user.id;
      if (!userId) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTH_REQUIRED',
          domain: ERROR_DOMAIN,
          message: 'Sign in required',
        });
      }
      const services = options.services();
      const client = await services.clients.get(body.client_id);
      if (!client || !client.enabled) {
        throw oauthError('UNAUTHORIZED_CLIENT', 'Client is not available');
      }
      if (!client.redirectUris.includes(body.redirect_uri)) {
        throw oauthError('INVALID_REQUEST', 'redirect_uri is not registered');
      }
      if (body.decision === 'deny') {
        await services.audit.record({
          clientId: body.client_id,
          localUserId: userId,
          action: 'consent',
          decision: 'deny',
        });
        return context.json({
          data: {
            redirectUri: redirectWithParams(body.redirect_uri, {
              error: 'access_denied',
              state: body.state,
            }),
          },
        });
      }
      const scopes = parseScopes(body.scope);
      validateRequestedScopes(scopes, client.allowedScopes);
      const audience = options.defaultAudience();
      const grant = await services.grants.createOrReuse({
        clientId: body.client_id,
        localUserId: userId,
        audience,
        scopes,
      });
      const code = await services.oauth.createAuthorizationCode({
        clientId: body.client_id,
        localUserId: userId,
        grantId: grant.id,
        redirectUri: body.redirect_uri,
        codeChallenge: body.code_challenge,
        scope: scopes.join(' '),
      });
      await services.audit.record({
        clientId: body.client_id,
        localUserId: userId,
        grantId: grant.id,
        action: 'consent',
        decision: 'approve',
      });
      return context.json({
        data: {
          redirectUri: redirectWithParams(body.redirect_uri, {
            code,
            state: body.state,
          }),
        },
      });
    },
  );

  router.post(
    '/oauth/token',
    describeRoute({
      tags,
      summary: 'OAuth2 token endpoint',
      operationId: 'agentAuthorizationToken',
      security: [],
      responses: {
        200: {
          description: 'Token response',
        },
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const body = await readTokenBody(context);
      const basic = basicClientCredentials(
        context.req.header('authorization') ?? undefined,
      );
      const clientId = basic?.clientId ?? body.client_id;
      const clientSecret = basic?.secret ?? body.client_secret;
      if (!clientId || !clientSecret) {
        throw oauthError(
          'INVALID_CLIENT',
          'Client authentication required',
          'UNAUTHENTICATED',
        );
      }
      const services = options.services();
      await services.clients.authenticate(clientId, clientSecret);
      const grantType = body.grant_type;
      if (grantType === 'authorization_code') {
        if (!body.code || !body.redirect_uri || !body.code_verifier) {
          throw oauthError('INVALID_REQUEST', 'Missing code exchange fields');
        }
        const tokens = await services.oauth.exchangeAuthorizationCode({
          clientId,
          code: body.code,
          redirectUri: body.redirect_uri,
          codeVerifier: body.code_verifier,
        });
        return context.json(tokens);
      }
      if (grantType === 'refresh_token') {
        if (!body.refresh_token) {
          throw oauthError('INVALID_REQUEST', 'refresh_token is required');
        }
        const tokens = await services.oauth.refresh({
          clientId,
          refreshToken: body.refresh_token,
          scope: body.scope,
        });
        return context.json(tokens);
      }
      throw oauthError('INVALID_REQUEST', 'Unsupported grant_type');
    },
  );

  router.post(
    '/oauth/revoke',
    describeRoute({
      tags,
      summary: 'OAuth2 token revocation (confidential client)',
      operationId: 'agentAuthorizationRevoke',
      security: [],
      responses: {
        200: { description: 'Always 200 per RFC 7009' },
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const body = await readTokenBody(context);
      const basic = basicClientCredentials(
        context.req.header('authorization') ?? undefined,
      );
      const clientId = basic?.clientId ?? body.client_id;
      const clientSecret = basic?.secret ?? body.client_secret;
      if (!clientId || !clientSecret) {
        throw oauthError(
          'INVALID_CLIENT',
          'Client authentication required',
          'UNAUTHENTICATED',
        );
      }
      const services = options.services();
      await services.clients.authenticate(clientId, clientSecret);
      if (body.token) {
        await services.oauth.revoke({
          clientId,
          token: body.token,
          tokenTypeHint: body.token_type_hint,
        });
      }
      return context.body(null, 200);
    },
  );

  return router;
}
