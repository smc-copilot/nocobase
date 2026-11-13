# P0 — Casdoor credential resolver (Gate A)

Branch: `fix/v3-smc-integration-readiness`  
Package: `@nocobase/app-plugin-casdoor-identity`

## What this phase proves

An external JWT verified with JWKS maps to a native local user through `externalIdentities`, then enters Authentication as an issued credential. Protected routes use `auth.required({ scopedKeys: true })`. Audience, expiry and Provider enablement are enforced (I01 / FIX-13.2).

## How to run

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity lint
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck
pnpm --filter @nocobase/app-plugin-casdoor-identity test
pnpm --filter @nocobase/app-plugin-casdoor-identity build
```

Primary evidence: `packages/plugins/app-plugin-casdoor-identity/tests/server/credential-resolver.test.ts` and related identity suites (75 tests on the remediation branch).

## Expected outcomes

| Scenario                     | Expectation                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| ALLOW                        | Valid JWT + binding → authenticated local user                     |
| DENY unbound                 | Valid JWT, no binding → 403 `SUBJECT_BINDING_REQUIRED`             |
| DENY disabled / Provider off | Account or Provider disabled → refuse (no undefined-issuer bypass) |
| Audience / exp               | Missing audience or expired token → refuse                         |

## CI vs live Casdoor

CI uses an ephemeral RSA keypair and local JWKS. Live Casdoor browser login and real JWTs are Gate B (`prd/acceptance/gate-a-report.md` R04/R05/R10 and `prd/acceptance/p4/`). Do not treat unit success as live OIDC success.

## Contract freeze

- `prd/acceptance/contracts/dto-receipt-v11.md`
- `prd/acceptance/contracts/error-codes.md`
- `prd/acceptance/contracts/permission-set-matrix.md`
- `prd/acceptance/contracts/data-model-draft.md`
