---
name: nocobase-app-plugin-agent-authorization
description: Register confidential agent clients, collect user consent, and issue opaque OAuth2 access tokens that resolve as agentAccessToken credentials.
---

# Agent Authorization

Use this Skill when an application needs NocoBase to act as the OAuth2 authorization server for an external agent client.

## Public surfaces

Server exports the plugin, `AgentAuthorizationConfig`, the `AGENT_*` credential constants, `agentAuthorizationServiceToken`, and `createAgentCredentialResolver`. HTTP routes live under `/api/agentAuthorization`. The client contributes `/agent-authorization/consent` and `/agent-authorization/grants`.

## App workflow

Register the server plugin after authentication and authorization. Set `agentAuthorization.audience` to this application's public origin. Create a client through the admin API, send the user to `GET /api/agentAuthorization/oauth/authorize` with PKCE S256, then exchange the code at `POST /api/agentAuthorization/oauth/token` with `client_secret_post` or `client_secret_basic`. Present the access token as `Bearer` or `x-agent-access-token` on routes that accept the `agentAccessToken` scheme.

## Permissions

Admin client, grant, and audit routes require a session plus settings actions `agentAuthorization.clients`, `agentAuthorization.grants`, or `agentAuthorization.audit`. Consent and "my grants" require only a signed-in user. Token and revoke are public and authenticate the confidential client inside the handler.
