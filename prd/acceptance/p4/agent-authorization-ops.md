# Agent authorization ops (V2.0)

Audience: operators of Integration Demo and SMC Control with NocoBase-owned OAuth2 for Octop and other agent clients. Credentials stay out of git.

## Topology (local Octop + local Demo + optional remote Casdoor)

- Demo App: Integration Demo with `@nocobase/app-plugin-agent-authorization` and `@nocobase/app-plugin-business-ui-adapter`.
- Control App: SMC Control registers the same authorization plugin and exposes client, grant, and audit administration under System settings.
- Octop: configure `oauth_authorize_url`, `oauth_token_url`, `oauth_revoke_url` to Demo `/api/agentAuthorization/oauth/*`, and Adapter base URL `/business-ui/connections/{connectionId}`.
- Casdoor: optional browser SSO only. Authorize, token, consent, and the adapter protocol run with Casdoor unset and with the Casdoor plugin omitted.

## Bootstrap sequence

1. Create local Demo users (Users admin or install seed).
2. `POST /api/agentAuthorization/clients` — capture one-time `clientSecret`. Control operators can do the same from System settings → Agent authorization → Clients (`/settings/agent-authorization/clients`).
3. `POST /api/businessUiAdapter/connections` with matching `clientId`, `serviceSecret`, `octopIssuer`, `allowedOrigins`.
4. Register forms (`generic.request.edit`).
5. Point Octop OAuth fields at Demo authorize/token/revoke; redirect URI must match Adapter `v1/oauth/callback` and the client’s registered redirect URIs.
6. User opens form from Octop → NocoBase login → consent → code → token → tickets.

## Control settings

SMC Control lists three administration pages under System settings → Agent authorization.

- Clients (`/settings/agent-authorization/clients`): create a client, rotate its secret, and enable or disable it. The list shows whether a secret exists and never displays the secret again.
- Grants (`/settings/agent-authorization/grants`): list grants and revoke one. Revocation does not expand another user’s consent.
- Audit (`/settings/agent-authorization/audit`): read client, grant, and consent audit events, including the actor recorded for create, update, secret rotation, and revoke.

## Client disable and re-enable

Disabling a client sets `enabled` to false and revokes every access token and refresh token issued to that client. API calls and existing embeds that depended on those tokens fail closed. Enabling the client again does not restore the revoked tokens. The person must start a new authorization-code exchange. A second client’s tokens and the person’s local NocoBase login stay usable.

## Login redirect and consent

An unauthenticated browser that opens authorize is sent to `{basePath}/login?redirect=` with a path back to `/agent-authorization/authorize` plus the original query. The parameter is `redirect`, which is the native login contract. `callbackURL` is not used. After login, the SPA route `/agent-authorization/authorize` leaves the client router and continues at `/api/agentAuthorization/oauth/authorize` with the same query so the authorization code flow can finish. The consent page shows server metadata from `GET /api/agentAuthorization/oauth/consent-context`: application name, instance label, audience, requested scopes, redirect URI, and grant expiry. Denying consent returns `access_denied` and does not create a grant.

## Rotation and revoke

1. Rotate agent client secret: `POST /api/agentAuthorization/clients/{clientId}/rotateSecret` (plaintext once), or the Rotate action on the Control clients page.
2. Rotate connection service secret separately via Business UI Adapter admin API.
3. Users revoke at `/agent-authorization/grants` (or `POST /api/agentAuthorization/me/grants/{grantId}/revoke`).
4. Admins may revoke grants from the Control grants page or with settings permission; this does not expand user consent.
5. `POST /api/agentAuthorization/oauth/revoke` still requires confidential-client authentication (`client_secret` or HTTP Basic). An Octop build that sends only `token` and `client_id` does not revoke the token. The supported user path is My authorized apps.

## Daily checks

1. `GET /api/healthz` on Demo.
2. Handshake with connection service credential returns `ok: true` and connection has `clientId`.
3. Sample authorize→token with PKCE for a test client, including the login `redirect` recovery when the browser has no session.
4. Confirm a revoked grant cannot refresh or open a new ticket, and a disabled client cannot use tokens issued before it was disabled.
