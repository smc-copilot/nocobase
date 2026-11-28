# Identity Hub P3 provider adapters

Branch `feat/v3-enterprise-identity-hub`. Changes are uncommitted. Tests use injected fakes. No live LDAP, and no Portal or Meeting wiring.

## Exit conditions

| ID  | Condition                                                                                                              | Result  |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Manual and OIDC identities link to the same person                                                                     | PASS    |
| 2   | LDAP identity key stays the GUID when the DN changes, and a second link keeps one identity                             | PASS    |
| 3   | OAuth2 without a stable userInfo subject refuses auto-provision (`STABLE_SUBJECT_REQUIRED` / `REFUSE_AUTO_PROVISION`)  | PASS    |
| 4   | OIDC rejects unsigned tokens and wrong issuer, audience, nonce, and state; fake-verifier happy path succeeds           | PASS    |
| 5   | Unregistered or disabled Casdoor leaves Manual resolution working                                                      | PASS    |
| 6   | OA LTPA rejects an unverified employee number and accepts only the verifier result                                     | PASS    |
| 7   | `syncPreview` writes no persons; `syncRun` does not call an application user API and does not disable other identities | PASS    |
| 8   | Identity Hub routes stay free of undeclared paths and OpenAPI schema problems                                          | PASS    |
| —   | Live LDAP, live OIDC, Portal, and Meeting                                                                              | NOT RUN |

## Commands

| Command                                                     | Exit |
| ----------------------------------------------------------- | ---- |
| `pnpm --filter @nocobase/app-plugin-identity-hub lint`      | 0    |
| `pnpm --filter @nocobase/app-plugin-identity-hub typecheck` | 0    |
| `pnpm --filter @nocobase/app-plugin-identity-hub test`      | 0    |
| `pnpm --filter @nocobase/app-plugin-identity-hub build`     | 0    |
| `pnpm peers:check`                                          | 0    |

`pnpm --filter @nocobase/app-plugin-identity-hub test` reported 5 files and 24 tests, all passed. The previous 16 tests are included in that run. No failures remain.

The test that covers exit conditions 1–7 is `packages/plugins/app-plugin-identity-hub/tests/server/adapters/p3-exit.test.ts`. Exit condition 8 is `tests/server/routes.test.ts` (`findUndeclaredApiRoutes` and `findApiDocumentSchemaProblems` are empty, including the four sync routes).
