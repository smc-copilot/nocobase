# Gate A v2.0 — Independent Multi-Agent Authorization

Date: 2026-11-14 (Asia/Shanghai)
Baseline branch: `feat/v3-agent-authorization` (from `develop/v3.0.1` @ `a7ddec85`)
PRD: `prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md`

## Verdict

Gate A (A01–A24) **code+automated evidence: PASS for core independent authorization**. Gate B / live Octop browser+HTTPS remain BLOCKED on environment (unchanged from P4). Do not reuse the Casdoor-forced v1.1 Gate A report as V2.0 completion evidence.

## Scope delivered

| Batch | Work                                                                                | Status                       |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------- |
| P1    | `@nocobase/app-plugin-agent-authorization`; Casdoor optional for core chain         | PASS                         |
| P2    | client registry, consent pages, code+PKCE, token/refresh/revoke, `agentAccessToken` | PASS                         |
| P3    | Adapter grant wiring; connection↔client; no subject pre-binding                     | PASS                         |
| P4    | Octop fixture contract notes, receipts/idempotency still green, reports             | PASS (A) / BLOCKED (B field) |

## Commands (exit 0)

```bash
pnpm --filter @nocobase/app-plugin-agent-authorization lint typecheck test build
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint typecheck test
pnpm --filter @nocobase/app-template-integration-demo test -- tests/server/agent-protocol.test.ts tests/server/agent-auth-boot.test.ts
```

Agent-authorization: 7 files / 9+ tests. Adapter: 8 files / 26 tests. Demo agent protocol + boot: 3 tests.

## A01–A24 checklist

| ID  | Result            | Evidence                                                                                        |
| --- | ----------------- | ----------------------------------------------------------------------------------------------- |
| A01 | PASS              | `agent-auth-boot.test.ts`; core services load without Casdoor config                            |
| A02 | PASS              | `clients.test.ts` two clients                                                                   |
| A03 | PASS              | oauth-flow + consent APIs                                                                       |
| A04 | PASS (API)        | consent `decision=deny` → `access_denied` redirect                                              |
| A05 | PASS              | wrong secret / disabled client                                                                  |
| A06 | PASS              | code replay + wrong PKCE                                                                        |
| A07 | PASS              | exchange + refresh scope unchanged                                                              |
| A08 | PASS              | adapter save/submit reject agent token (session-only)                                           |
| A09 | PASS              | `grants.test.ts` two clients                                                                    |
| A10 | PASS              | adapter grant/client mismatch checks in protocol                                                |
| A11 | PASS              | body subject is audit-only (grant selects identity)                                             |
| A12 | PASS              | Demo agent-protocol Permission Set revoke / record scope                                        |
| A13 | PASS              | revoke A leaves B                                                                               |
| A14 | PASS              | disable client → UNAUTHORIZED_CLIENT                                                            |
| A15 | PARTIAL           | Better Auth `disabledAt` on session; full matrix Gate B                                         |
| A16 | PASS              | revoke bumps revision; old tokens fail resolve                                                  |
| A17 | PARTIAL           | DI-scoped services (no module global runtime); dual-app live Gate B                             |
| A18 | PASS              | Demo protocol without subject pre-binding                                                       |
| A19 | PASS              | adapter protocol-flow UNKNOWN/FAILED                                                            |
| A20 | PASS              | adapter idempotency / loseSubmitResponse                                                        |
| A21 | PASS              | list clients hasSecret only; settings gated admin routes                                        |
| A22 | PASS              | new migrations only; old columns retained nullable                                              |
| A23 | PASS              | fixture SHA `64689a5b` + client_secret_post field expectations                                  |
| A24 | PASS (documented) | NocoBase revoke requires client_secret; Octop fixed revoke may omit it — use My authorized apps |

## Known compatibility notes

- Octop fixed plugin revoke may send `token` + `client_id` without `client_secret`. NocoBase revoke is confidential-client strict; A24 records the gap. User-facing revoke via `/agent-authorization/grants` is the supported path.
- Casdoor remains an optional login source; it is not required for Gate A core chain.
- Ops: `prd/acceptance/p4/agent-authorization-ops.md`.
