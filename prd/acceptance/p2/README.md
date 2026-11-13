# P2 evidence — IAM sync, mapping and subject pre-binding

## What this phase proves

The Casdoor identity plugin turns a verified external identity into a managed local user: first-login provisioning keyed by `(issuer, subject)`, deny-by-default admission, Permission Set mapping that never touches grants it did not create, directory reconciliation that disables and re-enables through `UserAdministrationService`, administration APIs, and controlled Octop subject pre-binding. The P0 resolver is unchanged: it still registers through `Auth.addCredentialResolver`, and Casdoor credentials stay route-scoped.

## How to run

From the repository root, one command at a time (PowerShell):

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity lint
pnpm --filter @nocobase/app-plugin-casdoor-identity typecheck
pnpm --filter @nocobase/app-plugin-casdoor-identity test
pnpm --filter @nocobase/app-plugin-casdoor-identity build
node scripts/validate-changesets.mjs
node scripts/check-peer-deps.mjs
node scripts/check-runtime-deps.mjs
```

The tests run against a real SQLite database with the authentication, authorization and identity migrations applied, an ephemeral RSA keypair and JWKS, and an in-memory directory. No live Casdoor is involved.

## Requirement coverage

| ID      | Requirement                                   | Evidence (under `packages/plugins/app-plugin-casdoor-identity/tests/`)                                                                                                                                                                                            |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM-001 | First login creates user and binding once     | `server/identity-provisioning.test.ts` (single create, 10 concurrent logins across two service graphs); `server/login-flow.test.ts` (8 concurrent HTTP requests, one user)                                                                                        |
| IAM-002 | Repeat login reuses the identity              | `server/identity-provisioning.test.ts` (renamed name and changed e-mail claim, still one user and one binding)                                                                                                                                                    |
| IAM-003 | Admission whitelist, deny by default          | `server/identity-admission.test.ts` (no policy, empty allow lists, unverified e-mail, deny wins); `server/identity-provisioning.test.ts` and `server/login-flow.test.ts` (no provider and empty policy provision nobody; 403 `ADMISSION_DENIED`)                  |
| IAM-004 | Mapping to allowlisted Permission Sets only   | `server/permission-mapping.test.ts` (off-allowlist, `root` and missing sets refused; token strings grant nothing; allowlist re-checked when applying)                                                                                                             |
| IAM-005 | Mapping ownership                             | `server/permission-mapping.test.ts` (manual grant survives revoke and is never adopted; shared set kept until the last rule stops; `sourceRevision` re-stamped; deleting a rule withdraws only its grants)                                                        |
| IAM-006 | Login-time check plus periodic reconciliation | `server/login-flow.test.ts` (mapping at login); `server/identity-sync.test.ts` (batches, paging, cursor); `server/authorization-and-scheduling.test.ts` and `server/provider-boot.test.ts` (Scheduler target and schedule; timer fallback only without Scheduler) |
| IAM-007 | Disable revokes sessions                      | `server/identity-sync.test.ts` (directory-forbidden and admission-lost users are disabled, sessions are gone, managed grants withdrawn); `server/login-flow.test.ts` (disabled user answers 403 `ACCOUNT_DISABLED`)                                               |
| IAM-008 | Re-enable restores nothing                    | `server/identity-sync.test.ts` (re-enabled by sync, zero sessions afterwards; a hand-disabled user is never re-enabled); `server/login-flow.test.ts`                                                                                                              |
| IAM-009 | Administration surface                        | `server/admin-routes.test.ts` (401 and 403 before any lookup, per-action checks, provider secret never echoed or audited); `server/authorization-and-scheduling.test.ts` (settings items and workspace placement)                                                 |
| IAM-010 | Manual reconciliation                         | `server/identity-sync.test.ts` (read-only preview writes nothing, batch id reuse refused, rerun with a new batch, failure recorded with error class); `server/admin-routes.test.ts` (preview, run, list, get)                                                     |

| ID     | Security case                             | Evidence                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-02 | Valid token, someone else's Octop subject | `server/subject-bindings.test.ts` (an import row naming another user is a `SUBJECT_MISMATCH` conflict and writes nothing; `assertSubjectOwnedBy` answers 403 `SUBJECT_MISMATCH` and never creates a binding); `server/admin-routes.test.ts` |
| SEC-03 | Same e-mail, different Casdoor subject    | `server/identity-provisioning.test.ts` and `server/login-flow.test.ts` (409 `IDENTITY_EMAIL_CONFLICT`, no binding for the second subject, the first user untouched)                                                                         |

Subject pre-binding uniqueness: `(connectionId, octopSubject)` is unique in the database; the preview also rejects duplicates inside a batch, re-pointing an existing subject, and a second subject for one local user on the same connection. A conflicting commit is atomic and returns the per-row report in `error.metadata.report`. Every created binding writes an audit event.

## Data model

The migration `casdoor_identity_202611140001_create_iam_sync_collections` adds `identityProviders`, `identityMappingRules`, `managedPermissionAssignments`, `identitySyncRuns`, `businessUiSubjectBindings` and `identityAuditEvents`, and two nullable columns on `externalIdentities` (`lastSeenEnabled`, `disabledBySyncAt`). The P0 migration is untouched. Differences from `prd/acceptance/contracts/data-model-draft.md`:

- `managedPermissionAssignments` stores `permissionSetKey` (the authorization plugin's key) where the draft says `permissionSetId`, and an `assignmentId` pointing at the authorization plugin's assignment row so revocation is exact.
- `identityMappingRules` is a new collection that the draft does not list; the rows `managedPermissionAssignments.mappingRuleId` points to live there.
- `identitySyncRuns` adds `providerId`, `trigger`, `dryRun`, `report` and timing columns around the draft's `batchId`, `cursor`, `counts`, `result`, `errorClass`.
- `identityAuditEvents` is new, to record changes to providers, mapping rules, sync runs and bindings.

## Settings items and APIs

The plugin registers `casdoorIdentity.sync`, `casdoorIdentity.mapping` and `casdoorIdentity.subjectBindings` with `authz.settings`, placed under an Identity subsection of the administration workspace. Routes are under `/api/casdoorIdentity/`; each checks its settings item before it reads anything. No React pages ship in this phase: the pages belong to the installing application.

## Frontend constraint

Identity admin UI pages are deferred. When they are authored, follow `prd/acceptance/FRONTEND_MODEL_CONSTRAINT.md`. The server settings items are registered so an application template can mount pages later through `defineAppRoutes()`.

## Remaining gaps

- **No live Casdoor run.** The Casdoor directory client (`GET /api/get-users` with client credentials) follows the documented API shape and is covered only by an in-memory directory. Live token issuance, JWKS, claim names (`owner`, `groups`, `email_verified`) and the directory call are still an environment evidence step.
- **Browser sign-in is documentation only.** `docs/generic-oauth-wiring.md` describes the `genericOAuth` wiring; no template `auth.ts` was edited. `genericOAuth` does not write `externalIdentities` or evaluate the admission policy, so a post-login hook that links the two belongs to the `smc-control` merge.
- **Octop connections are not modeled yet.** `connectionId` is a free identifier until the `businessUiConnections` collection lands with the Business UI adapter.
- **No admin pages and no i18n.** Settings titles are plain English strings; localized titles arrive with the client pages.
- **No event-triggered sync.** The optional webhook acceleration in IAM-006 is not implemented; login-time checks and scheduled reconciliation are.
- **Sync runs inside the request** for `POST /api/casdoorIdentity/syncRuns`; large directories should use the scheduled path until a `202` asynchronous form is added.
- **The Scheduler plugin is a required peer.** A host that does not register it gets the in-process timer only when `sync.fallbackIntervalSeconds` is set.

## Contract freeze

This phase builds on the frozen documents under `prd/acceptance/contracts/` and deviates from the data-model draft only as listed above.
