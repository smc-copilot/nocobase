# SMC platform ops handbook (draft)

Audience: operators deploying Control + demo Apps with Casdoor and the Business UI Adapter. Credentials stay out of git.

## Topology

- Casdoor: source checkout `D:\git\casdoor` (fixed SHA recorded in Phase 0) against PG database `smc_casdoor` on `192.168.102.247`.
- Control App: `app-template-smc-control` (releases + drive + secrets).
- Demo Apps: `app-template-integration-demo` instances A/B with separate PG databases.
- Octop host: remote `192.168.102.104` Docker; plugin SHA `64689a5b9863d974783f0605ed7673a7d5f73b22`.
- Adapter base URLs: `/business-ui/connections/{connectionId}` per Octop site.

## Daily checks

1. Casdoor JWKS reachable; Control and demo Apps healthy (`/api/healthz`).
2. Releases environments show expected Digests; no failed deploy stuck in progress.
3. Adapter handshake with connection service credential returns `ok: true`.
4. Sample ticket redeem in a browser (HTTPS once enabled) sets session cookie inside the iframe parent origin rules.

## Secret rotation

1. Rotate Casdoor client secrets in Casdoor UI; update App `casdoorIdentity` / Better Auth `genericOAuth` config; restart Apps.
2. Rotate Business UI connection `serviceSecret` via `POST /api/businessUiAdapter/connections` (hash stored only).
3. Rotate Releases registry credentials through secrets API (write-only).

## Backup / restore

1. Back up PG databases: `smc_casdoor`, control, demo-a, demo-b.
2. Back up encryption keys used by secrets/drive.
3. Restore into empty databases; run App migrations; verify Releases Digest inventory and one Adapter submit receipt.

## Incident: UNKNOWN submit

1. Do not retry submit. Query `POST .../v1/operations/{operationId}` and `POST .../v1/interactions/{id}`.
2. If a receipt exists, the Adapter recovery interval reconciles UNKNOWN → SUCCEEDED.
3. If still UNKNOWN after host recovery, inspect `businessUiOperations` / `businessUiReceipts` and application logs (desensitized).
