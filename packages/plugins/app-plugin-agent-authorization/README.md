# Agent Authorization App Plugin

NocoBase-owned OAuth2 authorization server for external agent clients (Octop and others).

It registers confidential clients, runs local-user consent (`authorization_code` + PKCE S256), issues opaque access and refresh tokens, supports refresh and confidential revoke, and resolves `agentAccessToken` credentials for Business UI Adapter routes. Casdoor is not required for this chain.

Admin APIs live under `/api/agentAuthorization/clients`, `/grants`, and `/auditEvents`. Browser pages: `/agent-authorization/consent` and `/agent-authorization/grants`.
