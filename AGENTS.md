# AGENTS

This file holds the team-shared rules for AI coding agents working in this repository. It is the single source of truth — `CLAUDE.md` is a one-line bridge (`@AGENTS.md`) so Claude Code reads the same content.

## Personal Local Rules

If a file `AGENTS.local.md` exists in this repository root, read it once at the start of the session and treat its contents as additional personal rules that extend (but never override) the team rules in this file.

## Project Structure

- New plugins live under `packages/plugins/@nocobase/plugin-<name>/`. Reuse the existing plugin scaffold; do not invent a new layout.
- This repo has two client runtimes: legacy v1 (`src/client/`, `@nocobase/client`, `SchemaComponent`) and v2 (`src/client-v2/`, `@nocobase/client-v2`, `FlowEngine` / `FlowModel`). Confirm which runtime the file under edit belongs to before writing code. Import direction is one-way: v1 client may import from v2 (`@nocobase/client-v2`), but v2 client must never import from v1 (`@nocobase/client`).
- Pro (not open source) plugins live in individual repositories under `packages/plugins` or `packages/pro-plugins` (for example, `@nocobase/plugin-workflow-approval`), but used not as submodules. When working on a pro plugin, clone its repo separately under `packages/plugins/` or `packages/pro-plugins/` and treat it as a standalone project with git.

## Code Style Rules

- Do not use `void someAsyncCall()` style fire-and-forget invocation. Prefer direct invocation such as `someAsyncCall()` and structure surrounding code accordingly.
- Avoid `any` in TypeScript. Reach for a specific type, a generic, or `unknown` with a narrowing guard instead. Replace `as any` with a named type or a type guard. When touching existing code that uses `any`, narrow it to a concrete type whenever feasible.
- For frontend components and pages, prefer Ant Design v5 components and follow its conventions. Reference https://ant.design/llms.txt for antd's LLM-friendly documentation when needed.
- For frontend components and pages, follow accessibility (a11y) best practices — add appropriate ARIA attributes, use semantic HTML, and ensure keyboard navigation works.
- Do not use async IIFE patterns in event handlers (for example: `runAsyncTask((async () => { ... })())`). Extract the async logic into a named async function or call it directly.
- Do not introduce new abstractions, error-handling layers, or feature flags beyond what the task requires. Three similar lines is better than a premature abstraction.
- Do not hard-wrap `//` comments at a narrow width. Let each comment line run to the project's `printWidth` (120) before wrapping, so prose fills the line instead of breaking into many short, truncated-looking lines. Verbatim content stays as-is: ASCII diagrams, bullet/numbered lists, blank-line paragraph breaks, and directive lines (`eslint-disable*`, `@ts-*`, `prettier-ignore`) keep their own line breaks.

## Database & Migrations

- Any change to database tables, columns, or indexes must ship with a migration under the plugin's `src/server/migrations/`. Import column types from `DataTypes`; do not reuse type names from neighboring migrations without verifying they still apply.
- New collections (tables), columns, indexes will be automatically synced to database when running the command `yarn nocobase upgrade` (will also run in docker container when start). So no need to create migration files in these cases.

## Testing Rules

- Run single test file: `yarn test <path-to-test-file>`
  - Client example: `yarn test packages/core/flow-engine/src/__tests__/flow-engine.test.ts --run --reporter=verbose`
  - Server example: `yarn test packages/core/server/src/__tests__/Application.test.ts`
- Always run related test files after modifying source code to ensure no regressions.
- Co-locate unit and integration tests in `__tests__` directories, naming files `*.test.ts` or `*.spec.ts`.
- Do NOT run server tests parallelly; they may interfere with each other. Use `yarn test` to run them sequentially.

## Internationalization (i18n)

- User-facing strings (UI labels, messages, errors shown to end users) must go through the project's i18n layer (`t()` / `useTranslation()`); do not hardcode them. Add keys for both `en-US` and `zh-CN` when introducing new strings.
## Knowledge graph

The repository knowledge graph lives in `lat.md/`. Search it with `lat search` or `lat locate` before grepping for design context, and run `lat check` after changing those files. Details: [.agents/rules/lat.md](.agents/rules/lat.md).

## Branches, Commits and Pull Requests

## V3 Workflow Entry Points

Keep workflow YAML files directly in `.github/workflows/`; GitHub Actions does not support workflow subdirectories. Prefix every v3 workflow filename with `v3-`, including matching implementations on the v3 branches. V3 implementations live on `v3-develop` and are synchronized to `v3-main` through release promotion, with stable-line fixes synchronized back to `v3-develop`. The files on default branch `main` expose manual or scheduled entry points and dispatch the v3 implementation.

Every v3 workflow change must include a synchronization check of its corresponding `main` entry. Implementation-only jobs and steps are picked up through dispatch to `v3-develop`, not copied into `main`; explicitly confirm that the entry still reaches the updated implementation. Workflow additions, deletions, renames, dispatch input changes and scheduled/default-branch trigger changes must update both sides in the same delivery. Keep workflow calls, dispatch filenames, path filters, tests and documentation consistent, coordinate the paired branch rollout, and preserve all existing v1/v2 workflow behavior.

## Pre-Commit Workflow

- Run `yarn eslint --fix` on touched files before reporting work as done. Resolve type errors and lint warnings rather than disabling them.

## Commit Conventions

- Commit messages follow Conventional Commits, prefixed with the affected scope: `fix(plugin-workflow): ...`, `feat(client): ...`, `chore: ...`, `docs: ...`.
A new changeset goes in `.changeset/`, never in `.changeset/pre/`, which the changesets tool owns; a file written there is silently ignored. A change that genuinely should not be released takes the `release:skip` label with the reason in the description. While `v3-develop` is in prerelease mode a `major` changeset cannot move an `X.0.0-beta.N` package; see [.agents/rules/pull-requests-and-changesets.md](.agents/rules/pull-requests-and-changesets.md) for what to do instead.

## V3 Workflow Synchronization

Executable workflow YAML stays directly in `.github/workflows/`, and every v3 workflow filename starts with `v3-`. Every v3 workflow change includes a synchronization check of its corresponding entry on `main`; additions, deletions, renames, dispatch input changes and trigger changes update that entry in the same delivery. The Quality checks have no workflow here: they are defined in `chenos/nocobase-ci`. Details: [.agents/rules/workflows-and-release.md](.agents/rules/workflows-and-release.md).

## Validation

Run `lint`, `typecheck`, `test` and `build` for the packages you modified and for the packages that consume what you changed, scoped with `pnpm --filter <package>`. A workspace-wide `pnpm -r test` is CI's job, not a routine step after an edit; widen the scope only when the change reaches further, such as an exported type, a shared configuration preset, or anything a generated application depends on. Prefer `pnpm fix` after editing code. Details: [.agents/rules/testing.md](.agents/rules/testing.md).

Run database integration suites one at a time locally, through the package that owns them (`pnpm --filter @nocobase/db-<dialect> test:integration`); never start two at once or leave one in the background. Details: [.agents/rules/database-integration-tests.md](.agents/rules/database-integration-tests.md).

## Rules That Are Easy to Break

- **Migrations are immutable once merged.** A migration merged into its target branch is never edited again, not its operations, its `down`, its name or its filename, and not even to reformat it; every correction is a new migration. Migrations are self-contained and never import live collection definitions. Details: [.agents/rules/database-migrations.md](.agents/rules/database-migrations.md).
- **Identity-sensitive packages are peers.** A plugin declares the runtime it plugs into, and every package listed in `IDENTITY_SENSITIVE_PACKAGES` in `scripts/check-peer-deps.mjs`, as a `peerDependency`, never as a `dependency`; `pnpm peers:check` enforces it. Details: [.agents/rules/package-dependencies.md](.agents/rules/package-dependencies.md).
- **Declare dependencies by who resolves them.** Ordinary server imports go in `dependencies`, client value imports in `peerDependencies`, and tests, build tooling and type-only imports absent from published declarations in `devDependencies`. Details: [.agents/rules/package-dependencies.md](.agents/rules/package-dependencies.md) and [.agents/rules/native-dependencies-and-builds.md](.agents/rules/native-dependencies-and-builds.md).
- **Keep the application templates in sync.** A framework-layer change to one of `packages/templates/app-template-default` and `packages/templates/app-template-examples` belongs in all applicable templates in the same change. Details: [.agents/rules/templates.md](.agents/rules/templates.md).
- **Tests never assert a workspace package's own version as a literal**; read it from the manifest. Details: [.agents/rules/testing.md](.agents/rules/testing.md).
- **Every `/api` route follows the HTTP API specification and declares itself for the API document.** Details: [.agents/rules/http-api.md](.agents/rules/http-api.md).

## Language

Anything a person outside the team can read is written in English. Anything only the team reads may be written in Chinese.

Write in English:

- Commit messages and pull request titles
- Code comments, including comments in workflow files
- Identifiers, log output, and error messages
- Changeset summaries — they are copied verbatim into the published CHANGELOG
- Everything a GitHub Actions run produces that a contributor sees: `workflow_dispatch` input descriptions, job and step names, job summaries, `::error` and `::warning` annotations, and the body of any pull request the workflow opens

Chinese is fine for:

- Feishu notification titles and bodies, which only reach an internal group

The distinction is the audience, not the file type. A comment inside a workflow is read by maintainers and stays English along with the rest of the code; the Feishu message that same workflow sends never leaves the team, so it stays Chinese.

The workflow files under `.github/workflows/` still carry Chinese comments written before this rule existed. Translate the ones you touch; there is no need to convert the rest in a single pass.

## Index

| Read                                                                                               | When                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [.agents/rules/lat.md](.agents/rules/lat.md)                                                       | Searching or updating the `lat.md/` knowledge graph                                                                                         |
| [.agents/rules/pull-requests-and-changesets.md](.agents/rules/pull-requests-and-changesets.md)     | Naming a branch, committing, creating or updating a pull request, writing its description or a changeset                                    |
| [.agents/rules/workflows-and-release.md](.agents/rules/workflows-and-release.md)                   | Changing anything under `.github/workflows/`, or release routing                                                                            |
| [.agents/rules/repository-layout-and-skills.md](.agents/rules/repository-layout-and-skills.md)     | Adding a package, choosing its directory, or adding or editing a Skill under `skills/`                                                      |
| [.agents/rules/dev-config.md](.agents/rules/dev-config.md)                                         | Creating a package, changing its tsconfig, ESLint, Prettier, Vitest or Vite configuration, dependencies and runtime, or publishing metadata |
| [.agents/rules/testing.md](.agents/rules/testing.md)                                               | Writing or moving a test, testing against a database, choosing what to validate                                                             |
| [.agents/rules/templates.md](.agents/rules/templates.md)                                           | Changing either application template, a plugin's business permissions, application themes and UI styling                                    |
| [.agents/rules/database-migrations.md](.agents/rules/database-migrations.md)                       | Writing or editing a migration or seed                                                                                                      |
| [.agents/rules/database-integration-tests.md](.agents/rules/database-integration-tests.md)         | Running dialect integration suites or `pnpm test:db`, changing the database packages                                                        |
| [.agents/rules/native-dependencies-and-builds.md](.agents/rules/native-dependencies-and-builds.md) | Native dependencies, `allowBuilds`, what reaches a deployment's `dist/`, building for another platform                                      |
| [.agents/rules/package-dependencies.md](.agents/rules/package-dependencies.md)                     | Adding or moving any dependency, identity-sensitive packages, `pnpm peers:check` or `pnpm deps:check` failures                              |
| [.agents/rules/http-api.md](.agents/rules/http-api.md)                                             | Adding or changing an `/api` route, API documentation, `pnpm openapi:check` failures                                                        |
| [.agents/rules/cli-json-output.md](.agents/rules/cli-json-output.md)                               | Adding or changing `--json` output of a command-line tool                                                                                   |
| [.agents/rules/docs-site.md](.agents/rules/docs-site.md)                                           | Changing anything under `docs/`                                                                                                             |
| [.agents/rules/typescript-libraries.md](.agents/rules/typescript-libraries.md)                     | Changing the exported API of a library package that emits declarations                                                                      |

For application themes and UI styling, also read `packages/app/app-skills/skills/nocobase-app-development/references/frontend/references/theme.md` from the repository root.
<!-- ges:v6:engineering-stack:begin -->

## AI Engineering Stack

Discovery / requirement grilling:
grill-with-docs
grilling
domain-modeling

Architecture / codebase design:
codebase-design

Work decomposition:
to-tickets

Project principles / constitution:
speckit-constitution

Feature specification:
speckit-specify

Requirement clarification:
speckit-clarify

Technical intent planning:
speckit-plan

Implementation plan methodology:
writing-plans

Execution:
subagent-driven-development

TDD:
test-driven-development

Debug:
systematic-debugging

Review:
requesting-code-review
receiving-code-review

Completion:
verification-before-completion
finishing-a-development-branch

GES manages composition and governance metadata.
GES does not generate Specs, implementation plans or code.

<!-- ges:v6:engineering-stack:end -->

## Agent skills

### Issue tracker

Issues live in GitHub Issues on origin (`smc-copilot/nocobase`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

single-context. See `docs/agents/domain.md`.

