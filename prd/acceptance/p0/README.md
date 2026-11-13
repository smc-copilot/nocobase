# P0 evidence — Casdoor credential resolver spike

## What this phase proves

An external JWT verified with JWKS maps to a native local user through `externalIdentities`, then enters Authentication as an issued credential. Protected routes use `auth.required({ scopedKeys: true })` (and Authorization middleware when the host registers it). No Hono-variable user-id bypass is used.

## How to run

From the repository root:

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity lint
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck
pnpm --filter @nocobase/app-plugin-casdoor-identity test
pnpm --filter @nocobase/app-plugin-casdoor-identity build
```

The three P0 scenarios live in `packages/plugins/app-plugin-casdoor-identity/tests/server/credential-resolver.test.ts`.

## Expected outcomes

| Scenario      | Expectation                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| ALLOW         | Valid JWT + `externalIdentities` row → HTTP 200 and `{ data: { userId } }` matching the bound native user    |
| DENY unbound  | Valid JWT, no binding row → HTTP 403, reason `SUBJECT_BINDING_REQUIRED`                                      |
| DENY disabled | Binding exists, user disabled with `UserAdministrationService.disable` → HTTP 403, reason `ACCOUNT_DISABLED` |

## CI vs live Casdoor

CI tests generate an ephemeral RSA keypair and local JWKS with `jose`. They do **not** require a running Casdoor instance. Live Casdoor token issuance and JWKS fetch remain a separate evidence step (Phase 0 / P2 environment work) and must not be claimed from these unit/integration results alone.

## Contract freeze

Frozen documents for this phase:

- `prd/acceptance/contracts/dto-receipt-v11.md`
- `prd/acceptance/contracts/error-codes.md`
- `prd/acceptance/contracts/permission-set-matrix.md`
- `prd/acceptance/contracts/data-model-draft.md`
