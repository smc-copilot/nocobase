import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  CASDOOR_APPLICATION_OWNER_ENV,
  CASDOOR_CLIENT_ID_ENV,
  CASDOOR_CLIENT_SECRET_ENV,
  CASDOOR_ENDPOINT_ENV,
  CASDOOR_ISSUER_ENV,
  CASDOOR_ORGANIZATION_ENV,
  CASDOOR_PERMISSION_OWNER_ENV,
  DEFAULT_ROUTE_AUDIENCE,
  DEFAULT_ROUTE_ENTRY_PATH,
  DEFAULT_ROUTE_ISSUER,
  DEFAULT_ROUTE_TICKET_TTL_SECONDS,
  OCTOP_API_ALLOW_HTTP_ENV,
  OCTOP_API_ALLOW_PRIVATE_DNS_ENV,
  OCTOP_API_HOST_ALLOWLIST_ENV,
  PORTAL_ROUTE_REDEEM_TOKEN_ENV,
  PORTAL_ROUTE_SIGNING_KEY_ENV,
  type EnterpriseAppPortalConfig,
} from '@superice/app-plugin-enterprise-app-portal/server';

/**
 * Isolation default: `contractFixture` so local screenshots can show authorized
 * cards without a live Casdoor. Production must set `access.source` to a proven
 * Casdoor contract or leave it `unconfigured` (fail closed).
 *
 * Octop management API hosts are never hard-coded here: set
 * `OCTOP_API_HOST_ALLOWLIST` in the application `.env`. An empty allowlist
 * rejects every management API URL.
 *
 * Route Tickets stay off until gray cutover (`routing.enabled`). Signing key and
 * redeem token are read from process env by name (`PORTAL_ROUTE_*`); they are
 * never stored in this config object.
 */
const enterpriseAppPortal: AppConfigFactory<EnterpriseAppPortalConfig> =
  defineAppConfig({
    defaults: () => ({
      launchHostAllowlist: [
        'copilot.superic.com',
        'superic.com',
        'app.superic.com',
        'ai.superic.com',
        'ai.superice.com',
      ],
      launchAllowHttp: true,
      launchAllowPrivateDns: true,
      octopApiHostAllowlist: [],
      octopApiAllowHttp: false,
      octopApiAllowPrivateDns: false,
      access: {
        source: 'managementApi',
        managementApi: {
          auth: 'query',
          organization: 'smartcore',
          applicationOwner: 'admin',
          permissionOwner: 'smartcore',
        },
      },
      routing: {
        enabled: false,
        publicRouterEntryUrl: 'https://ai.superice.com:8090/api/entry',
        loginEntryPath: DEFAULT_ROUTE_ENTRY_PATH,
        issuer: DEFAULT_ROUTE_ISSUER,
        audience: DEFAULT_ROUTE_AUDIENCE,
        ticketTtlSeconds: DEFAULT_ROUTE_TICKET_TTL_SECONDS,
        signingKeyEnv: PORTAL_ROUTE_SIGNING_KEY_ENV,
        signingKeyId: 'portal-2026-01',
        redeemServiceCredentialEnv: PORTAL_ROUTE_REDEEM_TOKEN_ENV,
        requireBinding: true,
        recheckEnforceOnRedeem: true,
        identityIssuerEnv: CASDOOR_ISSUER_ENV,
      },
    }),
    env: {
      [CASDOOR_ENDPOINT_ENV]: envString('access.managementApi.endpoint', {
        required: false,
        description:
          'Casdoor origin for portal management calls, without an /api suffix.',
      }),
      [CASDOOR_ORGANIZATION_ENV]: envString(
        'access.managementApi.organization',
        {
          required: false,
          description:
            'Casdoor organization that owns portal users and permissions.',
        },
      ),
      [CASDOOR_APPLICATION_OWNER_ENV]: envString(
        'access.managementApi.applicationOwner',
        {
          required: false,
          description:
            'Owner of Casdoor application records. Defaults to admin.',
        },
      ),
      [CASDOOR_PERMISSION_OWNER_ENV]: envString(
        'access.managementApi.permissionOwner',
        {
          required: false,
          description:
            'Owner of portal Permission records. Defaults to the organization.',
        },
      ),
      [CASDOOR_CLIENT_ID_ENV]: envString('access.managementApi.clientId', {
        required: false,
        secret: true,
        description:
          'Casdoor application client id used for management API calls. Not a committed secret.',
      }),
      [CASDOOR_CLIENT_SECRET_ENV]: envString(
        'access.managementApi.clientSecret',
        {
          required: false,
          secret: true,
          description:
            'Casdoor application client secret used for management API calls. Never commit it.',
        },
      ),
      [OCTOP_API_HOST_ALLOWLIST_ENV]: envStrings('octopApiHostAllowlist', ',', {
        required: false,
        description:
          'Comma-separated hostnames trusted for Octop management API calls. Distinct from launchHostAllowlist. Empty rejects every API URL.',
      }),
      [OCTOP_API_ALLOW_HTTP_ENV]: envBoolean('octopApiAllowHttp', {
        required: false,
        description:
          'When true, allowlisted Octop API hosts may use http://. Default false.',
      }),
      [OCTOP_API_ALLOW_PRIVATE_DNS_ENV]: envBoolean('octopApiAllowPrivateDns', {
        required: false,
        description:
          'When true, skip private/link-local DNS rejection for allowlisted Octop API hosts. Default false.',
      }),
      PORTAL_ROUTING_ENABLED: envBoolean('routing.enabled', {
        required: false,
        description:
          'When true, enable Route Ticket issue/redeem for Octop Router entry. Default false.',
      }),
      PORTAL_ROUTER_ENTRY_URL: envString('routing.publicRouterEntryUrl', {
        required: false,
        description:
          'Absolute Octop Router form action URL for ticket form_post (e.g. https://ai.superice.com:8090/api/entry).',
      }),
      PORTAL_ROUTE_LOGIN_ENTRY_PATH: envString('routing.loginEntryPath', {
        required: false,
        description:
          'Portal path after Casdoor login for unified Router entry. Default /main/route-entry.',
      }),
      PORTAL_ROUTE_ISSUER: envString('routing.issuer', {
        required: false,
        description: 'JWS iss claim for Route Tickets.',
      }),
      PORTAL_ROUTE_AUDIENCE: envString('routing.audience', {
        required: false,
        description: 'JWS aud claim for Route Tickets.',
      }),
      PORTAL_ROUTE_TICKET_TTL_SECONDS: envInteger('routing.ticketTtlSeconds', {
        required: false,
        description:
          'Route Ticket lifetime in seconds (clamped 15–60). Default 30.',
      }),
      PORTAL_ROUTE_SIGNING_KEY_ID: envString('routing.signingKeyId', {
        required: false,
        description: 'JWS kid for Route Ticket signatures.',
      }),
    },
  });

export default enterpriseAppPortal;
