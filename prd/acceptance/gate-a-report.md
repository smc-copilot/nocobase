# Gate A report — Remediation PRD v1.0

Branch: `fix/v3-smc-integration-readiness`  
Baseline: `develop/v3.0.1` @ `6970c076`  
Date: 2026-11-13 (Asia/Shanghai)

Status legend: **PASS** (code evidence on this branch) · **FAIL** · **NOT RUN** · **BLOCKED** (code vs environment noted).

## Commands executed (this delivery)

```bash
pnpm install --frozen-lockfile
pnpm --filter @nocobase/app-plugin-casdoor-identity test   # 75 passed
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint typecheck test build  # 14 passed
pnpm --filter @nocobase/app-template-smc-control exec vitest run \
  tests/server/publisher-releases-boundary.test.ts \
  tests/server/releases-access.test.ts \
  tests/client/client-routes.test.ts \
  tests/client/foundation-integration.test.ts
```

Frozen lockfile: PASS (R01). Octop handshake fixture uses pinned consumer source when Python available (`tests/server/octop-handshake.test.ts`).

## R01–R42

| ID  | Result                           | Evidence / notes                                                                                                                |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| R01 | PASS                             | `pnpm install --frozen-lockfile`                                                                                                |
| R02 | PASS                             | Scoped lint/typecheck/test/build on casdoor-identity + business-ui-adapter; template suites for Control/demo as exercised above |
| R03 | PASS                             | Template plugin-assembly / app-server tests mount routes and providers (see template tests from R0)                             |
| R04 | PASS (A) / BLOCKED (B env)       | A: identity provisioning + login-flow concurrency tests. B: live Casdoor browser first-login not completed in this run          |
| R05 | PASS (A) / BLOCKED (B env)       | A: email/subject conflict tests. B: live Casdoor                                                                                |
| R06 | PASS                             | `octop-handshake.test.ts` + handshake top-level paths in protocol-flow                                                          |
| R07 | PASS (A) / BLOCKED (B env)       | A: oauth callback seal + consume returns raw `code`. B: live PKCE against IdP token endpoint                                    |
| R08 | PASS                             | OAuth consume once; connection scoped in protocol services                                                                      |
| R09 | PASS                             | Credential resolver + scopedKeys routes in casdoor-identity                                                                     |
| R10 | PASS (A) / BLOCKED (B env)       | A: audience/exp/Provider disable tests. B: live JWT claim matrix                                                                |
| R11 | PASS                             | Admin routes 401/403 before lookup (casdoor + business-ui admin)                                                                |
| R12 | PASS                             | Nested subject issuer/sub mismatch refuses issueTicket                                                                          |
| R13 | PASS                             | form-urlencoded redeem accepted; JSON kept for tests                                                                            |
| R14 | PASS                             | Wrong nonce / replay refuse redeem                                                                                              |
| R15 | PASS                             | Binding revision check on redeem after revoke                                                                                   |
| R16 | PASS                             | Permission revoke + connection/embed bounds on save/submit                                                                      |
| R17 | PASS                             | Three-state business auth in protocol-flow                                                                                      |
| R18 | PASS                             | Draft `status=draft`, `record_id=null`, no SUCCESS result                                                                       |
| R19 | PASS                             | Flat submitted receipt; Octop merge fixture when available                                                                      |
| R20 | PASS                             | Detail redeem readonly HTML + server write deny                                                                                 |
| R21 | PASS                             | Deny issue without grant; ALREADY_SUBMITTED keeps formal `record_id`                                                            |
| R22 | PASS                             | `failBeforeWrite` → FAILED → safe retry → one formal document                                                                   |
| R23 | PASS                             | UNKNOWN retry → `RETRY_NOT_SAFE`                                                                                                |
| R24 | PASS (code path)                 | Idempotent submit returns same operation/receipt; lost-response field E2E NOT RUN                                               |
| R25 | PASS                             | `getInteraction` returns stable `operation_id` before submit                                                                    |
| R26 | PASS                             | reconcile only SUCCESS/FAILED/BUSINESS_REJECTED receipts; UNKNOWN without proof stays                                           |
| R27 | PASS                             | Same idempotency key, different payload → 409                                                                                   |
| R28 | PASS                             | Draft version conflict 409                                                                                                      |
| R29 | PASS                             | Dual-named DTO + sequence on receipts                                                                                           |
| R30 | PASS                             | Provider disable refuses credential                                                                                             |
| R31 | PASS                             | Directory authority / mapping tests (casdoor-identity)                                                                          |
| R32 | PASS                             | assignmentId ownership (permission-mapping)                                                                                     |
| R33 | PASS                             | Multi-rule shared revoke (permission-mapping)                                                                                   |
| R34 | PASS (SQLite A) / NOT RUN (PG B) | Binding uniqueness + concurrent import tests; PG dialect suite not run in this report                                           |
| R35 | PASS                             | `publisher-releases-boundary.test.ts`: page:rel-apps/access + ReleasesAccess related scopes; member 403                         |
| R36 | PASS (A)                         | publicBaseUrl / connection path in redeem HTML; multi-host field NOT RUN                                                        |
| R37 | BLOCKED (environment)            | HTTPS iframe Cookie — no TLS material in this run                                                                               |
| R38 | PASS (A)                         | Permission revoke stops new disclosure; historical receipts unchanged in code paths                                             |
| R39 | PASS (A)                         | New migrations only; describeMigration up/down for adapter `…140001…`                                                           |
| R40 | BLOCKED (environment)            | Remote Host / Docker `192.168.102.104`                                                                                          |
| R41 | BLOCKED (environment)            | Backup/restore + key rotation on remote                                                                                         |
| R42 | PASS (A)                         | `faultInjection` config-only; production leaves unset                                                                           |

## Gate B best-effort (R5)

| Check                                                                           | Result                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Casdoor OIDC discovery `http://127.0.0.1:8000/.well-known/openid-configuration` | PASS — issuer `http://localhost:8000`, jwks_uri `http://localhost:8000/.well-known/jwks` |
| Browser OIDC first login / repeat / disable against registered clients          | NOT RUN — requires Control/demo client + exact Redirect URI registration                 |
| Live resource JWT against app routes                                            | NOT RUN — same client/credentials prerequisite                                           |
| Octop host SHA `64689a5b`                                                       | BLOCKED (environment) — install package not available; no forged evidence                |
| HTTPS / remote dual-host / backup                                               | BLOCKED (environment) — see `prd/acceptance/p4/README.md`                                |

## Admin UI (Gate B product)

IdP / mapping / connection / form / audit **pages** remain Gate B deliverables (API already authorized). Gate A initializes via authenticated admin APIs. Follow `FRONTEND_MODEL_CONSTRAINT.md` (no Claude-authored React pages).
