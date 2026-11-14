# Gate A report — Remediation PRD v1.1

Branch: `fix/v3-smc-integration-v1.1` (checked out; delivery uncommitted on this branch)  
Baseline: `develop/v3.0.1` @ `f930624436f78fd31dd1f8b4a00bda72564417ec`  
Report date: 2026-11-14 (Asia/Shanghai)  
Prior report: Gate A v1.0 on `fix/v3-smc-integration-readiness` @ `6970c076` — retained below as historical; this file is the revised v1.1 evidence.

Status legend: **PASS** · **FAIL** · **PARTIAL** · **NOT RUN** · **BLOCKED**  
Gate rule (PRD §15.1): PARTIAL / NOT RUN do not count as Gate A pass for required A items.

## Revision reasons (v1.0 → v1.1)

| Topic                   | Why revised                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT-01 / R09 / R17     | Replaced `Boolean(permissionRef)` default with native Authorization checker; declared `casdoorAccessToken` on protocol user routes; real template HTTP N01–N06 |
| NEXT-02 / R04           | Browser OIDC seam via Better Auth `getUserInfo` → `IdentityProvisioningService.onLogin` + account link (no forged auth-table inserts)                          |
| NEXT-03 / R15–R16       | Binding `revision` + embed/ticket re-verify on every action; stale nullable fields invalidated                                                                 |
| NEXT-04 / R18 / R22–R26 | Operation-authoritative projection when no receipt; reconcile gating; `loseSubmitResponse` fault                                                               |
| NEXT-05 / R31–R34       | Snapshot freshness fail-closed; `(connectionId, activeLocalUserId)` unique; resource-token matrix tests                                                        |
| NEXT-06 / R01–R02 / R06 | Pinned Octop fixture (no `D:/git_ai`); fail-not-skip; four-package commands; Control/Demo boot + undeclared routes                                             |
| NEXT-07 / NEXT-08       | Explicitly Gate B / BLOCKED (also FRONTEND_MODEL_CONSTRAINT for React admin pages)                                                                             |

## Commands executed (this delivery)

```bash
pnpm install --frozen-lockfile                                          # exit 0
pnpm --filter @nocobase/app-plugin-casdoor-identity lint                # exit 0
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck           # exit 0
pnpm --filter @nocobase/app-plugin-casdoor-identity test                # exit 0 (87 passed)
pnpm --filter @nocobase/app-plugin-casdoor-identity build               # exit 0
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint             # exit 0
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck        # exit 0
pnpm --filter @nocobase/app-plugin-business-ui-adapter test             # exit 0 (25 passed)
pnpm --filter @nocobase/app-plugin-business-ui-adapter build            # exit 0
pnpm --filter @nocobase/app-template-smc-control lint                   # exit 0
pnpm --filter @nocobase/app-template-smc-control typecheck              # exit 0
pnpm --filter @nocobase/app-template-smc-control exec vitest run tests/server  # exit 0 (94 passed)
pnpm --filter @nocobase/app-template-smc-control build                  # exit 0
pnpm --filter @nocobase/app-template-integration-demo lint              # exit 0
pnpm --filter @nocobase/app-template-integration-demo typecheck         # exit 0
pnpm --filter @nocobase/app-template-integration-demo exec vitest run tests/server  # exit 0 (90 passed)
pnpm --filter @nocobase/app-template-integration-demo build             # exit 0
```

Env: Windows 10 / Node 24 / pnpm 11.7 / Python 3.12.10 + httpx 0.28.1 / SQLite test DBs.  
Octop fixture: `packages/plugins/app-plugin-business-ui-adapter/tests/fixtures/octop/MANIFEST.json` commit `64689a5b9863d974783f0605ed7673a7d5f73b22`.

N27 scope: four-package `lint` / `typecheck` / `build` plus plugin full `test` and template `vitest run tests/server` (includes N01–N06, N28 boot, Releases boundary). Full template `vitest run` on this Windows host still hits project harness spawn/Vite isolation failures (`server-imports`, `internal-packages`, `asset-url-build`); re-run full suite on Linux CI before release cut.

## R01–R42 (revised)

| ID  | Result                            | Evidence / notes                                                                             |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| R01 | PASS                              | `pnpm install --frozen-lockfile` exit 0                                                      |
| R02 | PASS                              | Four packages lint/typecheck/test(server)/build exit 0 as listed                             |
| R03 | PASS                              | `tests/server/gate-a-boot.test.ts` on Control + Demo; providers/routes mount                 |
| R04 | PASS (A) / BLOCKED (B)            | A: `browser-oauth.test.ts` + JWT provisioning. B: live Casdoor browser                       |
| R05 | PASS (A) / BLOCKED (B)            | A: email/subject conflict + admission deny paths. B: live IdP                                |
| R06 | PASS                              | `octop-handshake.test.ts` uses repo fixture; positive + negative handshake/receipt           |
| R07 | PASS (A) / BLOCKED (B)            | A: oauth callback/consume. B: live PKCE                                                      |
| R08 | PASS                              | OAuth consume once; connection scoped                                                        |
| R09 | PASS                              | Credential resolver + `casdoorAccessToken` security on tickets/interactions/operations/retry |
| R10 | PASS (A) / BLOCKED (B)            | A: audience/exp/issuer matrix (N26). B: live JWT                                             |
| R11 | PASS                              | Admin routes 401/403 before lookup                                                           |
| R12 | PASS                              | Nested subject issuer/sub mismatch refuses issueTicket                                       |
| R13 | PASS                              | form-urlencoded redeem accepted                                                              |
| R14 | PASS                              | Wrong nonce / replay refuse redeem                                                           |
| R15 | PASS                              | Binding revision bump invalidates tickets/embeds                                             |
| R16 | PASS                              | Revoke/disable refuses save/submit; permission re-check                                      |
| R17 | PASS                              | Native checker deny-by-default; N03/N04                                                      |
| R18 | PASS                              | Draft projection; no SUCCESS without receipt                                                 |
| R19 | PASS                              | Flat submitted receipt; Octop `merge_receipt` fixture                                        |
| R20 | PASS                              | Detail redeem readonly                                                                       |
| R21 | PASS                              | Deny without grant; ALREADY_SUBMITTED keeps formal id                                        |
| R22 | PASS                              | `failBeforeWrite` → FAILED → safe retry                                                      |
| R23 | PASS                              | UNKNOWN → `RETRY_NOT_SAFE`                                                                   |
| R24 | PASS                              | Idempotent submit; `loseSubmitResponse` (N18) in protocol-flow                               |
| R25 | PASS                              | Stable `operation_id` before submit                                                          |
| R26 | PASS                              | Reconcile only proven SUCCESS/FAILED/BUSINESS_REJECTED                                       |
| R27 | PASS                              | Idempotency key conflict 409                                                                 |
| R28 | PASS                              | Draft version conflict 409                                                                   |
| R29 | PASS                              | Dual-named DTO + sequence                                                                    |
| R30 | PASS                              | Provider disable refuses credential                                                          |
| R31 | PASS                              | Directory authority + snapshot freshness (N22)                                               |
| R32 | PASS                              | assignmentId ownership (N23)                                                                 |
| R33 | PASS                              | Multi-rule shared revoke (N24)                                                               |
| R34 | PASS (SQLite A) / NOT RUN (PG B)  | Binding uniqueness + concurrent bind (N25)                                                   |
| R35 | PASS                              | `publisher-releases-boundary.test.ts`                                                        |
| R36 | PASS (A) / NOT RUN (B multi-host) | publicBaseUrl / connection path                                                              |
| R37 | BLOCKED                           | HTTPS iframe Cookie — no TLS in this run                                                     |
| R38 | PASS (A)                          | Permission revoke stops new disclosure                                                       |
| R39 | PASS                              | New migrations only (`…140002…`, `…140003…`, `…140004…`); describeMigration covered          |
| R40 | BLOCKED                           | Remote Host / Docker field                                                                   |
| R41 | BLOCKED                           | Backup/restore + key rotation on remote                                                      |
| R42 | PASS (A)                          | `faultInjection` config-only                                                                 |

## N01–N36

| ID  | Result                         | Evidence                                                                                                                                                                                          |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N01 | PASS                           | `app-template-integration-demo/tests/server/casdoor-protocol.test.ts` tickets 200 with Casdoor JWT                                                                                                |
| N02 | PASS                           | Undeclared `/users` → 403 `CREDENTIAL_NOT_ACCEPTED`; save refuses resource token                                                                                                                  |
| N03 | PASS                           | No Permission Set → ticket denied                                                                                                                                                                 |
| N04 | PASS                           | Allow/deny/cross-record assertions in same file                                                                                                                                                   |
| N05 | PASS                           | Query succeeds with form scope; query/retry 403 when only an unrelated edit grant remains; restored grant succeeds again                                                                          |
| N06 | PASS                           | Revoke → next ticket denied                                                                                                                                                                       |
| N07 | PASS (A)                       | `browser-oauth.test.ts` `ensureCasdoorBrowserIdentity` provisions user/account/externalIdentity (controlled seam, not live OIDC callback)                                                         |
| N08 | PASS (A)                       | Repeat ensure + JWT-then-browser converge on same local user                                                                                                                                      |
| N09 | PASS (A)                       | Same-email different subject / admission deny refuse                                                                                                                                              |
| N10 | PASS (A)                       | Disabled provider → `IDENTITY_PROVIDER_DISABLED`; disabled user → `ACCOUNT_DISABLED` on browser ensure; JWT path covered in login-flow/credential-resolver                                        |
| N11 | PASS                           | Revoke/re-enable/rebind rejects old tickets                                                                                                                                                       |
| N12 | PASS                           | Post-redeem revoke/disable refuses save/submit                                                                                                                                                    |
| N13 | PASS                           | Revision mismatch rejects embed                                                                                                                                                                   |
| N14 | PASS                           | Migration invalidates nullable revision tickets/embeds; formal rows kept                                                                                                                          |
| N15 | PASS                           | failBeforeWrite → FAILED projection                                                                                                                                                               |
| N16 | PASS                           | UNKNOWN consistent; no draft fallback; no retry                                                                                                                                                   |
| N17 | PASS                           | Safe/concurrent retry ≤ one formal document                                                                                                                                                       |
| N18 | PASS                           | `loseSubmitResponse` COMMIT-then-drop recovery                                                                                                                                                    |
| N19 | PASS                           | Reconcile keeps UNKNOWN without proof                                                                                                                                                             |
| N20 | PASS                           | Stale sequence ignored; draft version real                                                                                                                                                        |
| N21 | PASS                           | Directory revoke with old JWT does not re-grant                                                                                                                                                   |
| N22 | PASS                           | Stale snapshot fail-closed on ticket/save/submit/retry                                                                                                                                            |
| N23 | PASS                           | Manual assignment preserved across rule A→B→none                                                                                                                                                  |
| N24 | PASS                           | Shared grant revoked only when last rule exits                                                                                                                                                    |
| N25 | PASS (SQLite)                  | Unique `(connectionId, activeLocalUserId)`; concurrent bind ≤1 success                                                                                                                            |
| N26 | PASS (A)                       | Wrong audience, expired, untrusted issuer, missing audience config, login-client audience as resource → refuse. Distinct Casdoor `token_use`/ID-token claim matrix vs live IdP → Gate B if needed |
| N27 | PASS                           | Commands + exit codes above (template evidence = `tests/server`, not full Windows `vitest run`)                                                                                                   |
| N28 | PASS                           | `gate-a-boot.test.ts` Control + Demo; `findUndeclaredApiRoutes` empty; handshake HTTP 200                                                                                                         |
| N29 | PASS                           | Fixture under `tests/fixtures/octop/` (no personal path); Python required; handshake + receipt ±                                                                                                  |
| N30 | PASS                           | This report binds SHA/command/env/assertion; PARTIAL/NOT RUN called out                                                                                                                           |
| N31 | BLOCKED                        | NEXT-07 admin React pages — Gate B + FRONTEND_MODEL_CONSTRAINT                                                                                                                                    |
| N32 | BLOCKED (pages) / PASS (API A) | Admin API authorized; UI pages Gate B                                                                                                                                                             |
| N33 | BLOCKED                        | NEXT-08 live Casdoor + Octop field journey                                                                                                                                                        |
| N34 | BLOCKED                        | HTTPS iframe / CSP / Cookie / dual Host                                                                                                                                                           |
| N35 | BLOCKED                        | Dual Host lifecycle / PG field / restart                                                                                                                                                          |
| N36 | BLOCKED                        | Backup/restore / key rotation / prod fault entry                                                                                                                                                  |

## Gate B (explicit)

| Item                                                                                          | Status                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| NEXT-07 admin React pages                                                                     | BLOCKED — Gate B; also blocked by `prd/acceptance/FRONTEND_MODEL_CONSTRAINT.md` |
| NEXT-08 live field (Casdoor browser, Octop card, HTTPS iframe, dual-Host, PG, backup/restore) | BLOCKED — environment                                                           |

## Historical v1.0 summary (superseded)

Previous Gate A report claimed PASS on R01–R42 A items under `fix/v3-smc-integration-readiness` with Octop handshake optionally skipped when `D:/git_ai/octop` was absent, and without native business Authorization or Casdoor credential admission on protocol routes. Those gaps are closed above; do not treat the v1.0 PASS rows as current evidence for Gate A entry.
