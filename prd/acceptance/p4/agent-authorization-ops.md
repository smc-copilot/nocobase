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

- Clients (`/settings/agent-authorization/clients`): create a client with name, description, instance label, one or more redirect URIs, allowed origins, scopes, and auth method (`client_secret_post` or `client_secret_basic`); edit those registration fields later (auth method stays API-only after create); rotate the secret; enable or disable. The list shows auth method and origins. The plaintext secret is shown once and never listed again.
- Grants (`/settings/agent-authorization/grants`): list grants and revoke one. Revocation does not expand another user’s consent.
- Audit (`/settings/agent-authorization/audit`): read client, grant, and consent audit events, including the actor recorded for create, update, secret rotation, and revoke.

## Client disable and re-enable

Disabling a client sets `enabled` to false, increments the client’s persistent `epoch`, revokes every access and refresh token for that client, and consumes unused authorization codes. Tokens, codes, tickets, and embeds stamped with the previous epoch fail closed even after the client is enabled again. Enabling the client does not move the epoch back. The person must start a new authorization-code exchange (and re-open any Business UI embed). A second client’s credentials and the person’s local NocoBase login stay usable.

## User disable and re-enable

Disabling a local user through native user administration opens a database transaction (or a savepoint when an outer write already holds one), writes `disabledAt`, revokes sessions, then runs `addOnUserDisabled` handlers on that same connection. Agent authorization registers `lifecycle.revokeUser` as a critical hook: every grant for that user bumps `credentialEpoch`, and the user’s agent tokens and unused codes are revoked on the transaction connection. A critical hook failure rolls the disable back (`disabledAt` and epoch stay unchanged) so the HTTP disable can be retried; non-critical hooks log and continue. Successful disable through `POST /api/users/{userId}/disable` uses `Idempotency-Key` receipts: a replayed success does not bump epoch again; a failed attempt leaves no success receipt so the same key can complete once. Existing embeds that stored the previous credential epoch fail closed. Enabling the user does not restore those credentials; a fresh consent and code exchange is required. Local password login after enable is separate from agent OAuth credentials.

## Login redirect and consent

An unauthenticated browser that opens authorize is sent to `{basePath}/login?redirect=` with a path back to `/agent-authorization/authorize` plus the original query. The parameter is `redirect`, which is the native login contract. `callbackURL` is not used. After login, the SPA route `/agent-authorization/authorize` leaves the client router and continues at `/api/agentAuthorization/oauth/authorize` with the same query so the authorization code flow can finish. The consent page shows server metadata from `GET /api/agentAuthorization/oauth/consent-context`: application name, instance label, audience, requested scopes, redirect URI, and grant expiry. Denying consent returns `access_denied` and does not create a grant.

## Rotation and revoke

1. Rotate agent client secret: `POST /api/agentAuthorization/clients/{clientId}/rotateSecret` (plaintext once), or the Rotate action on the Control clients page.
2. Rotate connection service secret separately via Business UI Adapter admin API.
3. Users revoke at `/agent-authorization/grants` (or `POST /api/agentAuthorization/me/grants/{grantId}/revoke`).
4. Admins may revoke grants from the Control grants page or with settings permission; this does not expand user consent.
5. `POST /api/agentAuthorization/oauth/revoke` still requires confidential-client authentication (`client_secret_post` body or `client_secret_basic` HTTP Basic). Missing credentials return 401 and leave the token usable. Octop disconnect reads `oauth_client_secret` from the protected secret bundle and revokes each held access and refresh token; local disconnect and remote revoke are separate statuses (`remote_revoke_status`: `succeeded` / `failed` / `skipped`). On remote failure Octop keeps the token credential for retry and does not write secrets into ordinary records, logs, URLs, or UI. My authorized apps and Control grant revoke remain the in-product paths for end-user and admin grant revocation.

## Daily checks

1. `GET /api/healthz` on Demo.
2. Handshake with connection service credential returns `ok: true` and connection has `clientId`.
3. Sample authorize→token with PKCE for a test client, including the login `redirect` recovery when the browser has no session.
4. Confirm a revoked grant cannot refresh or open a new ticket, and a disabled client cannot use tokens issued before it was disabled.
