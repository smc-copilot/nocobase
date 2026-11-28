# P2 Identity Hub core

Package `@nocobase/app-plugin-identity-hub` is a server-only plugin on `feat/v3-enterprise-identity-hub`. It is not registered in Portal, Meeting, or the Default template. Casdoor was not modified. There is no Broker binding and no production IAM data migration.

`pnpm plugin:create` was not applied. A dry run on Windows listed every template file, including client, CLI, jobs, locales, and skills, because `path.relative` returns backslashes and `includeTemplateFile` only matches forward slashes. The package was hand-scaffolded from the verification and Casdoor server layout instead.

## Exit conditions

| Condition                                                                                                          | Result  |
| ------------------------------------------------------------------------------------------------------------------ | ------- |
| Plugin manifest: peers, `pluginPolicy: do-not-preinstall`, en-US and zh-CN title and description                   | PASS    |
| Not registered in Portal or Meeting                                                                                | PASS    |
| No Broker binding and no IAM production migration                                                                  | PASS    |
| Migration `identity_hub_202611280001_create_core` plus `describeMigration`                                         | PASS    |
| Create a Person with no Casdoor plugin                                                                             | PASS    |
| Optional Manual `PersonIdentity` in the same transaction as the Person                                             | PASS    |
| Several providers, including two of one type                                                                       | PASS    |
| App registry and membership grant                                                                                  | PASS    |
| Concurrent duplicate identity link: one succeeds, the other is `ApiError`                                          | PASS    |
| Same email and different subjects do not merge                                                                     | PASS    |
| Membership revoke affects only that app                                                                            | PASS    |
| Disabled or archived Person cannot be granted a membership                                                         | PASS    |
| Duplicate `employeeNo` opens a conflict and does not create a second Person                                        | PASS    |
| Every mutating service call writes an audit row and calls `OutboxPublisher.publish`                                | PASS    |
| Audit redacts secret-like keys                                                                                     | PASS    |
| `evaluateAdmission` lives in the hub and does not import Casdoor                                                   | PASS    |
| `/api/identityHub/...` routes use `describeRoute`, `apiValidator`, `ApiError`, and `identityHub.*` settings grants | PASS    |
| `findUndeclaredApiRoutes` and `findApiDocumentSchemaProblems` are empty                                            | PASS    |
| Changeset `.changeset/identity-hub-core.md` (minor)                                                                | PASS    |
| message-broker `publisher('identity-hub').publish(message, { transaction })`                                       | NOT RUN |
| `pnpm openapi:check`                                                                                               | NOT RUN |

## Commands

| Command                                                     | Exit                           |
| ----------------------------------------------------------- | ------------------------------ |
| `pnpm install --no-frozen-lockfile`                         | 0                              |
| `pnpm --filter @nocobase/app-plugin-identity-hub lint`      | 0                              |
| `pnpm --filter @nocobase/app-plugin-identity-hub typecheck` | 0                              |
| `pnpm --filter @nocobase/app-plugin-identity-hub test`      | 0 (4 files, 16 tests)          |
| `pnpm --filter @nocobase/app-plugin-identity-hub build`     | 0                              |
| `pnpm peers:check`                                          | 0 (55 packages, no violations) |
| `pnpm plugins:check`                                        | 1                              |
| `pnpm deps:check`                                           | 1                              |

`plugins:check` does not mention `@nocobase/app-plugin-identity-hub`. It fails on pre-existing packages that have no `nocobase` title, description, or `pluginPolicy`: `app-plugin-agent-authorization`, `app-plugin-business-ui-adapter`, `app-plugin-casdoor-identity`, and `app-plugin-enterprise-app-portal`.

`deps:check` does not mention `@nocobase/app-plugin-identity-hub`. It fails because `app-plugin-agent-authorization` imports `react` from `devDependencies`.

`pnpm openapi:check` was not run. The plugin is not registered in a template, so that check would not load these routes. The package route test generates the document from `createRouter()` and expects both OpenAPI finders to be empty.

## Outbox gap

Mutations run in `database.transaction`. The same transaction inserts the business row, an `identityHubAuditEvents` row, and calls `OutboxPublisher.publish(message, { transaction })`. The process default is `NoopOutboxPublisher`. Tests use `InMemoryOutboxPublisher` and assert it was called.

The intended production call is `messageBroker.publisher('identity-hub').publish(message, { transaction })` from `@nocobase/message-broker`. It is not wired. This cut does not add a second outbox table. ADR-003 already records the Broker gap. Disable and archive do not cascade-revoke memberships; grant is refused while the Person is disabled or archived, and existing memberships stay until revoked.

Schema notes kept in the migration: `employeeNo` is unique for the whole table, not per organization, because a partial unique index on `(organizationId, employeeNo)` is not portable. Application uniqueness is `appId`, not `(appId, environment)`. `identityHubAuditEvents.details` is an extra JSON column so redaction has a stored payload. Provider rows store `secretRef` only; API views expose `secretConfigured` and audit payloads redact secret-like keys.

## Commit-ready files

Stage only these paths. Leave `.env`, `.cursor`, `prd/`, `app-template-smc-enterprise`, and the other untracked files alone.

- `packages/plugins/app-plugin-identity-hub/` (source, tests, manifest; `dist/` is gitignored)
- `.changeset/identity-hub-core.md`
- `pnpm-lock.yaml`
- `reports/identity-hub/p2-core-report.md`

`pnpm install` repaired a lockfile that pnpm reported as broken (duplicated `specifier` keys). The rewrite also moved `eslint-config-prettier` from 10.1.8 to 10.1.9 and dropped the stale importer `packages/plugins/app-plugin-distributed`, which is not a package in this checkout. Review that diff before committing it.

## Parent follow-ups

Nothing in the hub package failed lint, typecheck, test, or build. Before commit, review the lockfile diff above. Do not expect `pnpm plugins:check` or `pnpm deps:check` to exit 0 until the pre-existing packages listed above are fixed. Wire message-broker and run `pnpm openapi:check` in a later cut, after an application actually registers this plugin.
