# P3 acceptance — Business UI Adapter

Date: 2026-11-13  
Branch: `feat/v3-smc-business-ui-adapter`  
Package: `@nocobase/app-plugin-business-ui-adapter`

## Commands

```bash
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
```

Result: 9 tests passed (migrations, DTO dual naming, protocol flow, plugin contributions).

## Coverage vs PRD §10 / §11.4

| Area                                                   | Evidence                             |
| ------------------------------------------------------ | ------------------------------------ |
| Handshake + connection service credential              | `tests/server/protocol-flow.test.ts` |
| OAuth callback stash + consume (pending / ready)       | same                                 |
| Ticket issue (60s TTL) + redeem HTML + replay reject   | same                                 |
| Save draft + optimistic version conflict (409)         | same                                 |
| Idempotent submit (same key → same operation/receipt)  | same                                 |
| `interactions/{id}` recovers `latestSubmitOperationId` | same                                 |
| `operations/{id}` query_only                           | same                                 |
| UNKNOWN retry rejected (`RETRY_NOT_SAFE`)              | same (faultInjection path)           |
| formRef URL / unregistered reject                      | same                                 |
| Dual camelCase / snake_case DTO                        | `tests/server/dto.test.ts`           |
| Collections migration                                  | `tests/database/migrations.test.ts`  |

## Explicit gaps (not claimed)

- Full Hono route HTTP integration against a running Application (service-layer coverage only for protocol).
- Live Octop host + Casdoor end-to-end redeem in a browser (P4 remote).
- HTTPS / iframe cookie attributes (P4).
- Production fault-injection routes are config-gated (`businessUiAdapter.faultInjection`); default off.
- Admin `GET /api/businessUiAdapter/forms` returns an empty configuration list stub until a list query is needed.
- Generic form UI is server-rendered HTML from redeem (no React client page; FRONTEND_MODEL_CONSTRAINT).
