# SMC platform ops handbook (draft)

Audience: operators deploying Control + demo Apps with the Business UI Adapter and NocoBase-owned agent authorization. Credentials stay out of git. For the V2.0 authorize/token/consent flow see `agent-authorization-ops.md`.

## Topology

- Optional Casdoor: login SSO only (not required for agent OAuth).
- Control App: `app-template-smc-control` (releases + drive + secrets).
- Demo Apps: `app-template-integration-demo` with agent-authorization + business-ui-adapter.
- Octop host: plugin SHA `64689a5b9863d974783f0605ed7673a7d5f73b22`; OAuth URLs point at Demo `/api/agentAuthorization/oauth/*`.
- Adapter base URLs: `/business-ui/connections/{connectionId}` per Octop site (connection must set `clientId`).

## Daily checks

1. Demo `/api/healthz`; optional Casdoor JWKS only if SSO is enabled.
2. Releases environments show expected Digests; no failed deploy stuck in progress.
3. Adapter handshake with connection service credential returns `ok: true` and connection has `clientId`.
4. Sample authorize→consent→token→ticket; redeem in a browser (HTTPS once enabled).

## Secret rotation

1. Rotate agent client secrets via `POST /api/agentAuthorization/clients/{clientId}/rotateSecret` (plaintext once).
2. Rotate Business UI connection `serviceSecret` via `POST /api/businessUiAdapter/connections` (hash stored only).
3. If Casdoor SSO is used, rotate its client secrets separately; this does not replace agent client secrets.
4. Rotate Releases registry credentials through secrets API (write-only).

## Backup / restore

1. Back up PG databases: `smc_casdoor`, control, demo-a, demo-b.
2. Back up encryption keys used by secrets/drive.
3. Restore into empty databases; run App migrations; verify Releases Digest inventory and one Adapter submit receipt.

## Incident: UNKNOWN submit

1. Do not retry submit. Query `POST .../v1/operations/{operationId}` and `POST .../v1/interactions/{id}`.
2. If a receipt exists, the Adapter recovery interval reconciles UNKNOWN → SUCCEEDED.
3. If still UNKNOWN after host recovery, inspect `businessUiOperations` / `businessUiReceipts` and application logs (desensitized).
