# P2 — IAM sync, mapping and subject pre-binding (Gate A)

Branch: `fix/v3-smc-integration-readiness`  
Package: `@nocobase/app-plugin-casdoor-identity`

## What this phase proves

Verified external identity → managed local user: first-login provisioning, deny-by-default admission, Permission Set mapping that never claims foreign assignments (I04 / FIX-14), directory authority snapshots so old JWT groups cannot re-grant (I02 / FIX-13.3), and binding uniqueness migrations (I05 / FIX-15).

## How to run

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity lint
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck
pnpm --filter @nocobase/app-plugin-casdoor-identity test
pnpm --filter @nocobase/app-plugin-casdoor-identity build
node scripts/validate-changesets.mjs
```

## Requirement coverage (summary)

| Area                                   | Evidence under `packages/plugins/app-plugin-casdoor-identity/tests/` |
| -------------------------------------- | -------------------------------------------------------------------- |
| First / repeat / concurrent login      | `server/identity-provisioning.test.ts`, `server/login-flow.test.ts`  |
| Admission deny-by-default              | `server/identity-admission.test.ts`                                  |
| Mapping allowlist + ownership          | `server/permission-mapping.test.ts`                                  |
| Directory sync disable / re-enable     | `server/identity-sync.test.ts`                                       |
| Admin API 401/403 before lookup        | `server/admin-routes.test.ts`                                        |
| Subject binding uniqueness / conflicts | `server/subject-bindings.test.ts`                                    |
| Token audience / Provider disable      | `server/credential-resolver.test.ts`                                 |

## Remaining Gate B items

- Live Casdoor directory (`GET /api/get-users`) and real claim names.
- Browser OIDC first login through template `genericOAuth` against Casdoor `:8000`.
- Admin UI pages for IdP/mapping/bindings (API ready; UI is Gate B, non-Claude models or reuse existing components).
