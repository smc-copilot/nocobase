# P1 Source Integration Acceptance — 2026-11-27

**Candidate branch:** `feat/v3-app-engineering-integration`  
**Worktree:** `D:\git\nocobase-wt-app-engineering`  
**PRD:** `prd/NocoBase-App-Engineering-PRD-v1.1.md` (workspace copy, not committed)

## 1. Snapshot verification (after fresh fetch)

| Object                                             | SHA                                                           | Notes                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Target `origin/develop/v3.0.1`                     | `f05a4918b981cd4c8a26600e4df13c17134155a0`                    | Unchanged vs PRD historical snapshot                                                  |
| Portal pinned                                      | `784b4527cf8aee070dc36ff72568f69617fe59cd`                    |                                                                                       |
| Portal local advances (included by owner decision) | tip `b08743d5edfe8d37d78583e24afe0319f0c0af2a`                | 3 unpushed commits: docker sandbox, Octop default expert, agent users + route tickets |
| Meeting                                            | `b85dd5b2fdf37e60cddd7c8e295f3b676b17f3c7` (`origin/meeting`) |                                                                                       |
| Merge-base                                         | `20aa1d414544a7d04a723f3e8209c3b33a9cc44c`                    | Divergence 122 / 4 reconfirmed                                                        |
| Ancestor checks                                    | target ⊆ both sources                                         | Pass                                                                                  |

SSH: repository `core.sshCommand` uses `~/.ssh/smc-copilot`. Fetch succeeded after that configuration.

## 2. Merge commits (history retained, `--no-ff`)

1. `09969ae723` — Portal pinned `784b4527`
2. `39450f8bbd` — local Portal advances through `b08743d5`
3. `91e85cf8d4` — Meeting `b85dd5b2`

## 3. MERGE-05 public auth/users decisions

| File                                                      | Conflict?                         | Outcome                                                                                          |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `app-plugin-authentication/server/user-administration.ts` | Meeting-only                      | Kept Meeting `INVALID_USERNAME` mapping                                                          |
| `.../user-administration.test.ts`                         | Meeting-only                      | Kept                                                                                             |
| `app-plugin-users/server/routes/index.ts`                 | Both sides, non-overlapping hunks | Auto-merged: Portal `inviterLocale` + Meeting OpenAPI `INVALID_USERNAME` docs — verified present |

Plugin tests after merge: authentication 304 PASS, users 173 PASS.

## 4. Meeting gateway settings — broken source tip repaired

Meeting tip `b85dd5b2` is itself a merge that **resurrected** the old gateway-settings world on top of the new contract model (deleted at `4963960ee9`). Symptoms: ESM missing export `GATEWAY_CLIENT_SECRET_PURPOSE`, empty-DB apply impossible, typecheck flood on old field names.

**Repair (owner-approved “complete new model”):** restore `packages/apps/app-meeting` tree to consistent commit `4963960ee9`, deleting resurrected files and restoring polluted ones. Diff vs `4963960ee9` afterward is only `package.json` (pnpm 11.11.0 + `@nocobase/db-postgres`) plus subsequent Windows/host test fixes and one `service.ts` type guard.

**Coverage boundary:** if a live DB ever executed the resurrected `202611160002_gateway_settings` (old shape), upgrade needs a field-shape reconcile migration — blocked pending field backup (A07 site copy). Empty-DB path uses `170001` create + `170002` alter only.

## 5. Database evidence (isolated PG only — `nocobase3` untouched)

Host: `192.168.99.161:5432` PostgreSQL 16.15. Databases created: `nb_t2_meeting_empty`, `nb_t2_portal_empty`.

| Case                               | Result                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting empty `nocobase db apply`  | PASS — full chain including `202611170001`/`170002`/`170003`/`180001`                                                                               |
| Portal empty `nocobase db apply`   | PASS — includes `enterprise_app_portal_202611231200_route_tickets`                                                                                  |
| `meeting_gateway_settings` columns | New contract shape only: `enabled`, `origin`, `resource`, `instance_id`, `allowed_origin`, `contract_revision`, `sealed_*`, `credential_version`, … |

## 6. Builds (linux-x64, Node 24, `--tar`)

| App     | Artifact                                                          | Size    |
| ------- | ----------------------------------------------------------------- | ------- |
| Portal  | `packages/apps/app-enterprise-portal/storage/exports/dist.tar.gz` | 72.2 MB |
| Meeting | `packages/apps/app-meeting/storage/exports/dist.tar.gz`           | 23.0 MB |

Windows retarget fix applied: `retarget-native.mjs` uses `shell: true` on win32 (same fix as owner’s uncommitted workbench change).

## 7. Meeting typecheck / vitest (clean env — no `DB_*` pollution)

| Check                                           | Result                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @nocobase/app-meeting typecheck` | PASS                                                                               |
| Vitest (clean)                                  | 891 passed / 15 failed / 1 todo (907) before focused Windows CRLF/`pnpm.cmd` fixes |
| Focused retest after CRLF + spawn fixes         | 6/7 files green; remaining host-specific cases documented below                    |

**Remaining known failures (not P1 blockers for A01–A06 / builds):** Windows client harness (`useClientApplication` outside root), temp-dir Vite resolve of `@nocobase/app-client`, template `app-server` sign-in expecting 422/`INVALID_USERNAME` but getting 500 (present on Better Auth 1.7.21 path — investigate as follow-up), notification invitation directory assertion. Full log: `storage/t2-logs/vitest-clean.log`.

## 8. Baseline acceptance matrix (P1 subset)

| ID            | Status  | Evidence                                                                                                                     |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A01           | PASS    | This report §1                                                                                                               |
| A02           | PASS    | §2–§3                                                                                                                        |
| A03           | PARTIAL | Independent builds PASS; live start smoke deferred to isolation install step if needed before merge                          |
| A04           | PASS    | Package names unchanged; Meeting username policy files retained                                                              |
| A05           | PASS    | Shared migrations not rewritten; resurrected old migration removed as never-on-clean-history                                 |
| A06           | PASS    | §5                                                                                                                           |
| A07 site copy | BLOCKED | Awaiting field backup                                                                                                        |
| A08           | PARTIAL | `db-postgres` in Meeting dependencies + empty PG apply PASS; isolated-artifact PG reconnect still recommended before release |

## 9. Commits to follow

Separate commits for: (1) Meeting gateway revive cleanup + PG/pnpm, (2) Windows retarget + test host fixes, (3) acceptance report.
