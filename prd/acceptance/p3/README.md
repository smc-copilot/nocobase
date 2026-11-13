# P3 — Business UI Adapter protocol (Gate A)

Branch: `fix/v3-smc-integration-readiness`  
Package: `@nocobase/app-plugin-business-ui-adapter`

## Commands

```bash
pnpm --filter @nocobase/app-plugin-business-ui-adapter lint
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter build
```

Result on remediation branch: adapter protocol, Octop handshake fixture, migrations and DTO suites pass (14+ tests in-package; see Gate A report).

## Coverage vs Remediation FIX-04…12

| Area                                                            | Evidence                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Handshake top-level paths + features                            | `tests/server/protocol-flow.test.ts`, `tests/server/octop-handshake.test.ts` |
| OAuth seal/open consume returns raw code                        | protocol-flow                                                                |
| Nested subject + nonce + redeem replay                          | protocol-flow                                                                |
| Draft save: `status=draft`, `record_id=null`, no SUCCESS result | protocol-flow                                                                |
| Stable submit slot `operation_id` before first submit           | protocol-flow                                                                |
| Idempotent submit + same-key different payload 409              | protocol-flow                                                                |
| Business auth three states (allow / deny / subsequent reject)   | protocol-flow                                                                |
| Detail redeem readonly + server write reject                    | protocol-flow                                                                |
| FAILED `failBeforeWrite` + safe retry                           | protocol-flow                                                                |
| UNKNOWN retry rejected; `side_effect: null`                     | protocol-flow                                                                |
| Admin settings auth + real forms list                           | routes / admin tests                                                         |
| CSP `frame-ancestors` + `business-ui/hint` postMessage          | redeem HTML / route headers                                                  |

## Explicit gaps (not claimed as Gate A field evidence)

- Live Octop host at pinned SHA `64689a5b` browser redeem.
- HTTPS iframe Cookie attributes (R37).
- Production must leave `businessUiAdapter.faultInjection` unset (R42).
