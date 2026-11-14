# Gate A v2.0 — Independent Multi-Agent Authorization (R01–R04 rematch)

Date: 2026-11-14 (Asia/Shanghai)

Baseline branch: `fix/v3-agent-auth-integrity-r01-r04` (from `develop/v3.0.1` @ `4690a51f`)

Driving audit: `prd/NocoBase-V2.0-Integrity-Recheck-4690a51f-20261114.md`

Prior integrity rematch (C01–C08): `prd/acceptance/gate-a-v2-report.md` history at `4690a51f`

PRD: `prd/NocoBase-Independent-Multi-Agent-Authorization-PRD-v2.0.md`

## Verdict

Gate A (A01–A24) **code + automated evidence: PASS** after closing recheck leftovers R01–R04. The previous rematch claimed A16/A22 PASS too early: re-enable still revived credentials, and null embed scopes still fell back to grant ∩ client. This round makes those fail closed with persistent epochs and deletes unscoped temporary rows. Gate B / live Octop browser + HTTPS + target Host/DB remain **BLOCKED** on field environment and are not claimed here.

## Recheck closures (R01–R04)

| ID  | Fix                                                                                                                                                           | Evidence                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R01 | Migration deletes unscoped tickets/embeds; `loadEmbed` / redeem refuse missing or malformed scope snapshots (no grant ∩ client fallback)                      | `business_ui_adapter_202611170001_invalidate_unscoped_and_epochs`, `caller-authorization.test.ts`, `migrations.test.ts` |
| R02 | `agentClients.epoch` bumps on disable; tokens/codes stamped and checked; tickets/embeds store `clientEpoch` and refuse mismatch after re-enable               | `agent_authorization_202611170001_epochs`, `clients.ts`, `client-lifecycle.test.ts`, `lifecycle.test.ts`                |
| R03 | Native `addOnUserDisabled` hook → `lifecycle.revokeUser` bumps `agentGrants.credentialEpoch` and revokes tokens/codes; enable does not revive old credentials | `user-administration.ts`, agent provider boot, `lifecycle.test.ts`, adapter `client-lifecycle.test.ts`                  |
| R04 | Control clients create/edit: description, multi redirect URIs, origins, authMethod (create only); list shows method and origins                               | `clients.tsx`, locales, `agent-clients.test.tsx`                                                                        |

## Commands (each run separately)

Environment: Windows, Node from the workspace engines, pnpm workspace. Commands below were run separately on 2026-11-14 against this tree.

```bash
pnpm --filter @nocobase/app-plugin-agent-authorization lint
pnpm --filter @nocobase/app-plugin-agent-authorization typecheck
pnpm --filter @nocobase/app-plugin-agent-authorization test
pnpm --filter @nocobase/app-plugin-agent-authorization build
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter build
pnpm --filter @nocobase/app-plugin-authentication lint
pnpm --filter @nocobase/app-plugin-authentication typecheck
pnpm --filter @nocobase/app-plugin-authentication build
pnpm --filter @nocobase/app-template-integration-demo test -- tests/server/agent-auth-boot.test.ts tests/server/agent-protocol.test.ts tests/server/agent-auth-without-casdoor.test.ts
pnpm --filter @nocobase/app-template-smc-control lint
pnpm --filter @nocobase/app-template-smc-control typecheck
pnpm --filter @nocobase/app-template-smc-control test -- tests/client/agent-clients.test.tsx tests/project/plugin-assembly.test.ts
pnpm peers:check
node scripts/validate-changesets.mjs
```

Recorded results:

| Command                             | Exit | Notes                                                                                    |
| ----------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| agent-authorization lint            | 0    |                                                                                          |
| agent-authorization typecheck       | 0    |                                                                                          |
| agent-authorization test            | 0    | 11 files / 22 tests (lifecycle epoch non-revival, migrations epochs)                     |
| agent-authorization build           | 0    |                                                                                          |
| business-ui-adapter lint            | 0    |                                                                                          |
| business-ui-adapter typecheck       | 0    |                                                                                          |
| business-ui-adapter test            | 0    | 10 files / 35 tests (unscoped refuse, client/user lifecycle, migration deletes unscoped) |
| business-ui-adapter build           | 0    |                                                                                          |
| authentication lint/typecheck/build | 0    | `addOnUserDisabled` hook                                                                 |
| integration-demo agent tests        | 0    | 3 files / 4 tests                                                                        |
| smc-control lint                    | 0    |                                                                                          |
| smc-control typecheck               | 0    |                                                                                          |
| smc-control agent client UI tests   | 0    | create/edit/authMethod/origins                                                           |
| peers:check                         | 0    |                                                                                          |
| validate-changesets                 | 0    | `.changeset/agent-auth-integrity-r01-r04.md`                                             |

Full `pnpm --filter @nocobase/app-template-smc-control test` and a concurrent workspace `nocobase build` hit unrelated environment failures (spawn pnpm ENOENT, Vite external resolve in temp asset build, submission-settings timeouts, app-cli dist ENOTEMPTY). Those are not treated as Gate A agent-authorization regressions; the scoped agent UI and assembly tests above are the Control evidence for R04.

## A01–A24 checklist

| ID  | Result            | Evidence                                                                                                                                                                       |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 | PASS              | `agent-auth-without-casdoor.test.ts` boots agent+adapter with Casdoor plugin omitted                                                                                           |
| A02 | PASS              | `clients.test.ts`                                                                                                                                                              |
| A03 | PASS              | `oauth-browser.test.ts` unauthenticated authorize uses `/login?redirect=`                                                                                                      |
| A04 | PASS              | consent deny → `access_denied`                                                                                                                                                 |
| A05 | PASS              | wrong secret / disabled client authenticate                                                                                                                                    |
| A06 | PASS              | code replay + wrong PKCE                                                                                                                                                       |
| A07 | PASS              | exchange + refresh; issuance gated by `requireUsable`                                                                                                                          |
| A08 | PASS              | save/submit session-only                                                                                                                                                       |
| A09 | PASS              | two grants; revoke A leaves B                                                                                                                                                  |
| A10 | PASS              | `caller-authorization.test.ts` cross-client query/retry refused                                                                                                                |
| A11 | PASS              | body subject audit-only                                                                                                                                                        |
| A12 | PASS              | Demo Permission Set revoke / record scope                                                                                                                                      |
| A13 | PASS              | grant revoke invalidates tokens                                                                                                                                                |
| A14 | PASS              | `client-lifecycle.test.ts` disabled client blocks embed save; re-enable does not revive old embed                                                                              |
| A15 | PASS              | `lifecycle.test.ts` disabled user cannot create codes or refresh                                                                                                               |
| A16 | PASS              | re-enable does **not** revive old refresh/code/token/embed; new authorization code required (`lifecycle.test.ts`, `client-lifecycle.test.ts`, epochs)                          |
| A17 | PASS              | `audience-isolation.test.ts`                                                                                                                                                   |
| A18 | PASS              | no Octop subject pre-binding                                                                                                                                                   |
| A19 | PASS              | UNKNOWN/FAILED receipt actions                                                                                                                                                 |
| A20 | PASS              | idempotency / loseSubmitResponse                                                                                                                                               |
| A21 | PASS              | Control clients create/edit with description, origins, authMethod, multi redirect URIs (`agent-clients.test.tsx`); secret never re-listed; authMethod change remains API-only  |
| A22 | PASS              | Unscoped embeds/tickets deleted by migration; runtime refuses null/malformed scopes (no fallback). Legacy null after `202611160001` is intentionally cleared by `202611170001` |
| A23 | PASS              | Octop fixture contract + `client_secret_post`                                                                                                                                  |
| A24 | PASS (documented) | NocoBase revoke requires client_secret; use My authorized apps / Control revoke                                                                                                |

## Known compatibility notes

- Octop fixed plugin revoke may send `token` + `client_id` without `client_secret`. NocoBase revoke stays confidential-client strict.
- Casdoor remains optional SSO; agent OAuth and adapter protocol do not require it.
- Ops: `prd/acceptance/p4/agent-authorization-ops.md` (epoch disable semantics and Control registration).

## Out of scope (Gate B)

- Real Octop browser activation and full card journey.
- HTTPS iframe Cookie/CSP/Origin matrix.
- Target PostgreSQL, dual Host, backup/restore, live key rotation drills with production data.
