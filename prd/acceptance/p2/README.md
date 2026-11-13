# P2 — Casdoor identity IAM

Date: 2026-11-13 (Asia/Shanghai)
Branch: `feat/v3-smc-casdoor-identity`

## Delivered (server)

| Item                                                         | Location                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| IAM collections migration                                    | `database/migrations/casdoor_identity_202611140001_create_iam_sync_collections.ts` |
| Provisioning / admission / sync / mapping / subject bindings | `server/services/*`, `server/identity/*`                                           |
| Admin APIs                                                   | `server/routes/admin.ts` under `/api/casdoorIdentity`                              |
| Settings registration                                        | `server/authorization.ts` (`authz.settings.add`) — no React pages in this phase    |
| genericOAuth wiring notes                                    | `docs/generic-oauth-wiring.md`                                                     |
| Credential resolver (P0 + P2)                                | `server/credential-resolver.ts`                                                    |

## Tests

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity test
```

Expected: 70 tests passing (provisioning, admission, sync, mapping ownership, subject bindings, disable reject, admin routes).

## Frontend constraint

Identity admin UI pages are deferred. When authored, do not use Claude models (`prd/acceptance/FRONTEND_MODEL_CONSTRAINT.md`). Server settings catalog items are registered so an app template can mount pages later via `defineAppRoutes()`.

## Remaining for full P2 exit

- Wire `genericOAuth` into `app-template-smc-control` / integration-demo auth config (after template merge).
- Live Casdoor JWT login evidence (admin password / clients).
- Octop subject pre-binding exercised against a real Octop export (P4).
