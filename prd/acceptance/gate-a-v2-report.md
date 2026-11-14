# Gate A v2.0 — Independent Multi-Agent Authorization (integrity rematch)

Date: 2026-11-14 (Asia/Shanghai)

Baseline branch: `fix/v3-agent-authorization-integrity` (from `develop/v3.0.1` @ `736f9322`)

Driving audit: `prd/NocoBase-V2.0-Code-Integrity-Review-20261114.md`

PRD: `prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md`

## Verdict

Gate A (A01–A24) **code + automated evidence: PASS** after closing C01–C08 from the integrity review. Gate B / live Octop browser + HTTPS + target Host/DB remain **BLOCKED** on field environment and are not claimed here. Do not reuse the Casdoor-forced v1.1 Gate A report, and do not reuse the pre-integrity `736f9322` Gate A claim without the regressions listed below.

## Integrity closures

| ID  | Fix                                                                                                                             | Evidence                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| C01 | Protocol query/retry/interaction routes carry caller credential; agent grant must match interaction grant and connection client | `caller-authorization.test.ts`                                                                                     |
| C02 | Effective scope is grant ∩ tokenScopes ∩ clientScopes; ticket/embed store intersection                                          | `caller-authorization.test.ts`, `protocol-flow.test.ts`, migration `business_ui_adapter_202611160001_embed_scopes` |
| C03 | Client disable revokes all client tokens; embed/ticket paths use `requireUsable`                                                | `client-lifecycle.test.ts`, `lifecycle.test.ts`                                                                    |
| C04 | Native `/login?redirect=` + SPA `/agent-authorization/authorize` recovery; base path via `joinBasePath`                         | `oauth-browser.test.ts`                                                                                            |
| C05 | UNKNOWN → `query_status`+`close`; FAILED+safeRetry+writable → `retry`+`close`                                                   | `octop-handshake.test.ts` feeding pinned `receipt.py` `buttons_for`                                                |
| C06 | Consent metadata API + Control clients/grants/audit pages + admin/me audit writes                                               | Control assembly tests; consent page; admin/me routes                                                              |
| C07 | This rematch report with separate commands                                                                                      | sections below                                                                                                     |
| C08 | Disabled user cannot exchange or refresh                                                                                        | `lifecycle.test.ts`                                                                                                |

## Commands (each run separately)

Environment: Windows, Node from the workspace engines, pnpm workspace. Each command below was run separately on 2026-11-14 against the integrity tree and exited 0.

```bash
pnpm --filter @nocobase/app-plugin-agent-authorization lint
pnpm --filter @nocobase/app-plugin-agent-authorization typecheck
pnpm --filter @nocobase/app-plugin-agent-authorization test
pnpm --filter @nocobase/app-plugin-agent-authorization build
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter build
pnpm --filter @nocobase/app-template-integration-demo test -- tests/server/agent-auth-boot.test.ts tests/server/agent-protocol.test.ts tests/server/agent-auth-without-casdoor.test.ts
pnpm --filter @nocobase/app-template-smc-control lint
pnpm --filter @nocobase/app-template-smc-control typecheck
pnpm peers:check
node scripts/validate-changesets.mjs
```

Recorded results:

| Command                       | Exit | Notes                                                                           |
| ----------------------------- | ---- | ------------------------------------------------------------------------------- |
| agent-authorization lint      | 0    |                                                                                 |
| agent-authorization typecheck | 0    |                                                                                 |
| agent-authorization test      | 0    | 11 files / 21 tests (oauth-browser, lifecycle, audience-isolation)              |
| agent-authorization build     | 0    |                                                                                 |
| business-ui-adapter lint      | 0    |                                                                                 |
| business-ui-adapter typecheck | 0    |                                                                                 |
| business-ui-adapter test      | 0    | 10 files / 33 tests (caller-authorization, client-lifecycle, octop buttons_for) |
| business-ui-adapter build     | 0    |                                                                                 |
| integration-demo agent tests  | 0    | 3 files / 4 tests (boot + protocol + without-casdoor)                           |
| smc-control lint              | 0    |                                                                                 |
| smc-control typecheck         | 0    |                                                                                 |
| peers:check                   | 0    |                                                                                 |
| validate-changesets           | 0    | `.changeset/agent-authorization-integrity.md`                                   |

## A01–A24 checklist

| ID  | Result            | Evidence                                                                                                                                                                                |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | PASS              | `agent-auth-without-casdoor.test.ts` boots agent+adapter with Casdoor plugin omitted and Casdoor collections absent; `agent-auth-boot.test.ts`                                          |
| A02 | PASS              | `clients.test.ts`                                                                                                                                                                       |
| A03 | PASS              | `oauth-browser.test.ts` unauthenticated authorize uses `/login?redirect=` and recovers through `/agent-authorization/authorize`                                                         |
| A04 | PASS              | `oauth-browser.test.ts` consent `decision=deny` returns `access_denied` and creates no grant                                                                                            |
| A05 | PASS              | wrong secret / disabled client authenticate                                                                                                                                             |
| A06 | PASS              | code replay + wrong PKCE                                                                                                                                                                |
| A07 | PASS              | exchange + refresh; issuance gated by `requireUsable`                                                                                                                                   |
| A08 | PASS              | save/submit session-only; agent token cannot substitute                                                                                                                                 |
| A09 | PASS              | two grants; revoke A leaves B                                                                                                                                                           |
| A10 | PASS              | `caller-authorization.test.ts` cross-client query/retry refused; operation status unchanged                                                                                             |
| A11 | PASS              | body subject audit-only                                                                                                                                                                 |
| A12 | PASS              | Demo Permission Set revoke / record scope                                                                                                                                               |
| A13 | PASS              | grant revoke invalidates tokens                                                                                                                                                         |
| A14 | PASS              | `client-lifecycle.test.ts` disabled client blocks embed save                                                                                                                            |
| A15 | PASS              | `lifecycle.test.ts` disabled user refresh/exchange fail at issuance                                                                                                                     |
| A16 | PASS              | re-enable does not revive revoked tokens; new code required                                                                                                                             |
| A17 | PASS              | `audience-isolation.test.ts` two service audiences share DB; cross-audience resolve fails                                                                                               |
| A18 | PASS              | no Octop subject pre-binding                                                                                                                                                            |
| A19 | PASS              | real service UNKNOWN/FAILED → Octop `buttons_for` yields `query_status` / `retry`                                                                                                       |
| A20 | PASS              | idempotency / loseSubmitResponse                                                                                                                                                        |
| A21 | PASS              | admin HTTP gated; Control UI registered; secret never re-listed                                                                                                                         |
| A22 | PASS              | `migrations.test.ts` seeds an embed row before `business_ui_adapter_202611160001_embed_scopes`; after up, `scopes` is null. `caller-authorization.test.ts` falls back to grant ∩ client |
| A23 | PASS              | Octop fixture contract + `client_secret_post`                                                                                                                                           |
| A24 | PASS (documented) | NocoBase revoke requires client_secret; Octop may omit — use My authorized apps / Control revoke                                                                                        |

## Known compatibility notes

- Octop fixed plugin revoke may send `token` + `client_id` without `client_secret`. NocoBase revoke stays confidential-client strict. User and Control revoke paths are supported.
- Casdoor remains an optional login source on Demo/Control; A01 proves the core chain without it.
- Ops: `prd/acceptance/p4/agent-authorization-ops.md`.

## Out of scope (Gate B)

- Real Octop browser activation and full card journey.
- HTTPS iframe Cookie/CSP/Origin matrix.
- Target PostgreSQL, dual Host, backup/restore, live key rotation drills with production data.
