import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import type { AccessIdentity } from '../services/casdoor-application-access.js';
import type { EnterprisePortalServices } from '../services/composition.js';
import {
  RouteTicketCandidatesSchema,
  RouteTicketIssueInput,
  RouteTicketIssueSchema,
  RouteTicketRedeemInput,
  RouteTicketRedeemSchema,
} from './schemas.js';

const tags = ['EnterpriseAppPortal'];

export interface RouteTicketSessionOptions {
  readonly services: () => EnterprisePortalServices;
  readonly identityOf: (context: Context) => AccessIdentity;
}

export interface RouteTicketRedeemOptions {
  readonly services: () => EnterprisePortalServices;
}

/**
 * Session-authenticated issue + candidate routes. Mounted on the portal router
 * that already runs authentication middleware.
 */
export function registerRouteTicketSessionRoutes(
  router: Hono,
  options: RouteTicketSessionOptions,
): void {
  const services = options.services;

  router.get(
    '/routeTickets/candidates',
    describeRoute({
      tags,
      summary: 'List Octop applications eligible for Router Ticket entry',
      operationId: 'enterpriseAppPortalListRouteTicketCandidates',
      ...cliRoute(false),
      description:
        'Requires a signed-in session. Returns only enabled Octop apps with a Casdoor key and allowlisted launch URL. Empty when routing is disabled.',
      responses: {
        200: dataResponse(RouteTicketCandidatesSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const tickets = services().routeTickets;
      if (!tickets.routingEnabled()) {
        return context.json({
          data: {
            applications: [],
            autoLaunchMode: 'disabled' as const,
            suggestedAppCode: null,
            routingEnabled: false,
          },
        });
      }
      const identity = options.identityOf(context);
      const bound = await services().subjects.requireForUser(identity.userId);
      const candidates = await services().launch.listRoutingCandidates(
        { ...identity, casdoorUserId: bound.casdoorUserId },
        { requireBinding: true },
      );
      return context.json({
        data: {
          ...candidates,
          routingEnabled: true,
        },
      });
    },
  );

  router.post(
    '/routeTickets',
    describeRoute({
      tags,
      summary: 'Issue a one-time Router Ticket for form_post entry',
      operationId: 'enterpriseAppPortalIssueRouteTicket',
      ...cliRoute(false),
      description:
        'Issues a short-lived Ed25519 JWS. The compact ticket is returned once for browser form_post and is never logged.',
      responses: {
        200: dataResponse(RouteTicketIssueSchema),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'Missing Casdoor binding or application access (`IDENTITY_BINDING_REQUIRED`, `APP_ACCESS_DENIED`).',
        ),
        503: apiErrorResponse(
          503,
          'Routing disabled or signing key unavailable (`ROUTE_DEPENDENCY_UNAVAILABLE`).',
        ),
      },
    }),
    apiValidator('json', RouteTicketIssueInput),
    async (context) => {
      const body = context.req.valid('json');
      return context.json({
        data: await services().routeTickets.issue(
          options.identityOf(context),
          body,
        ),
      });
    },
  );
}

/**
 * Internal redeem endpoint for Octop Router. Bearer service token only —
 * no browser session.
 */
export function createRouteTicketRedeemRouter(
  options: RouteTicketRedeemOptions,
): Hono {
  const router = new Hono();
  router.post(
    '/internal/routeTickets/redeem',
    describeRoute({
      tags,
      summary: 'Redeem a Router Ticket (service credential)',
      operationId: 'enterpriseAppPortalRedeemRouteTicket',
      ...cliRoute(false),
      description:
        'Called by Octop Router with `Authorization: Bearer` redeem service token. Re-checks Casdoor enforce without cache before returning the public Octop URL.',
      responses: {
        200: dataResponse(RouteTicketRedeemSchema),
        ...apiErrorResponses,
        401: apiErrorResponse(
          401,
          'Missing or invalid redeem service credential (`AUTH_REQUIRED`).',
        ),
        403: apiErrorResponse(
          403,
          'Ticket invalid, replayed, expired, or access revoked (`APP_ACCESS_DENIED`, `TICKET_REPLAYED`, `TICKET_EXPIRED`).',
        ),
      },
    }),
    apiValidator('json', RouteTicketRedeemInput),
    (async (context, next) => {
      options
        .services()
        .routeTickets.assertRedeemCredential(
          context.req.header('authorization'),
        );
      await next();
    }) satisfies MiddlewareHandler,
    async (context) => {
      const body = context.req.valid('json');
      return context.json({
        data: await options.services().routeTickets.redeem(body),
      });
    },
  );
  return router;
}
