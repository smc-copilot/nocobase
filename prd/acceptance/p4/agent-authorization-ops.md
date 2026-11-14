# Agent authorization ops (V2.0)

Audience: operators of Integration Demo with NocoBase-owned OAuth2 for Octop and other agent clients. Credentials stay out of git.

## Topology (local Octop + local Demo + optional remote Casdoor)

- Demo App: Integration Demo with `@nocobase/app-plugin-agent-authorization` and `@nocobase/app-plugin-business-ui-adapter`.
- Octop: configure `oauth_authorize_url`, `oauth_token_url`, `oauth_revoke_url` to Demo `/api/agentAuthorization/oauth/*`, and Adapter base URL `/business-ui/connections/{connectionId}`.
- Casdoor: optional browser SSO only; core authorize/token/consent must work with Casdoor unset.

## Bootstrap sequence

1. Create local Demo users (Users admin or install seed).
2. `POST /api/agentAuthorization/clients` — capture one-time `clientSecret`.
3. `POST /api/businessUiAdapter/connections` with matching `clientId`, `serviceSecret`, `octopIssuer`, `allowedOrigins`.
4. Register forms (`generic.request.edit`).
5. Point Octop OAuth fields at Demo authorize/token/revoke; redirect URI must match Adapter `v1/oauth/callback` and the client’s registered redirect URIs.
6. User opens form from Octop → NocoBase login → consent → code → token → tickets.

## Rotation and revoke

1. Rotate agent client secret: `POST /api/agentAuthorization/clients/{clientId}/rotateSecret` (plaintext once).
2. Rotate connection service secret separately via Business UI Adapter admin API.
3. Users revoke at `/agent-authorization/grants` (or `POST /api/agentAuthorization/me/grants/{grantId}/revoke`).
4. Admins may revoke grants with settings permission; this does not expand user consent.

## Daily checks

1. `GET /api/healthz` on Demo.
2. Handshake with connection service credential returns `ok: true` and connection has `clientId`.
3. Sample authorize→token with PKCE for a test client.
4. Confirm revoked grant cannot refresh or open a new ticket.
