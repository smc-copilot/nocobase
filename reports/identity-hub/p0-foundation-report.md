# P0 Foundation v3 compatibility

Branch `feat/v3-enterprise-identity-hub` at `e4d399b6ee135aee0e3215c410d0489713b4f4d4` (HEAD is still that commit; this work is uncommitted).

## What changed

Foundation `0.1.0-beta.21` no longer takes a config section, a CLI plugin, or `foundation({ manifest, settingsGroup, ... })`. Each of the four packages now calls `foundation()` with no options, keeps the server and client plugin registration, and drops `server/config/foundation.ts`. `organizeNavigation` still takes `(items, routes)`. It no longer calls `groupFoundationNavigation`. Routes whose `surface` is `systemSettings` are folded into the existing settings group, so Plugins stays at `/settings/plugins` under `systemSettings.system`.

The application still owns copies of inbox, Users, Roles, and Default access. Those plugin routes use the same paths, so `client/runtime.ts` excludes `@nocobase/app-plugin-notification-in-app:inbox`, `@nocobase/app-plugin-users:settingsUsers`, `@nocobase/app-plugin-authorization:settingsRoles`, and `@nocobase/app-plugin-authorization:settingsDefaultAccess`. Without that exclusion the client route tree cannot resolve, and the Plugins page never registers.

Meeting home no longer renders the capability catalog. It still links to Meetings when that page is granted. smc-control and integration-demo home pages use the default template's local `capabilities.ts` and `prompt-dialog.tsx`. Portal home was left as it was. `package.json` still depends on `@nocobase/app-plugin-foundation`. smc-control and integration-demo `packageManager` is `pnpm@11.11.0`, matching the workspace, so `nocobase build` can install workspace dependencies. Their previous pin was `pnpm@11.7.0`, and Corepack then refused the build.

## Files

- `packages/apps/app-enterprise-portal/cli/plugins.ts`
- `packages/apps/app-enterprise-portal/client/lib/navigation-transform.ts`
- `packages/apps/app-enterprise-portal/client/plugins.ts`
- `packages/apps/app-enterprise-portal/client/runtime.ts`
- `packages/apps/app-enterprise-portal/server/config/foundation.ts` (deleted)
- `packages/apps/app-enterprise-portal/server/config/index.ts`
- `packages/apps/app-enterprise-portal/tests/client/foundation-integration.test.ts`
- `packages/apps/app-enterprise-portal/tests/client/permission-workspace.test.ts`
- `packages/apps/app-enterprise-portal/tests/client/settings-navigation.test.ts`
- `packages/apps/app-meeting/cli/plugins.ts`
- `packages/apps/app-meeting/client/lib/navigation-transform.ts`
- `packages/apps/app-meeting/client/pages/home/index.tsx`
- `packages/apps/app-meeting/client/plugins.ts`
- `packages/apps/app-meeting/client/runtime.ts`
- `packages/apps/app-meeting/server/config/foundation.ts` (deleted)
- `packages/apps/app-meeting/server/config/index.ts`
- `packages/apps/app-meeting/tests/client/foundation-integration.test.ts`
- `packages/apps/app-meeting/tests/client/home.test.tsx`
- `packages/apps/app-meeting/tests/client/settings-navigation.test.ts`
- `packages/templates/app-template-smc-control/cli/plugins.ts`
- `packages/templates/app-template-smc-control/client/lib/navigation-transform.ts`
- `packages/templates/app-template-smc-control/client/pages/home/index.tsx`
- `packages/templates/app-template-smc-control/client/pages/home/capabilities.ts` (added)
- `packages/templates/app-template-smc-control/client/pages/home/prompt-dialog.tsx` (added)
- `packages/templates/app-template-smc-control/client/plugins.ts`
- `packages/templates/app-template-smc-control/client/runtime.ts`
- `packages/templates/app-template-smc-control/package.json`
- `packages/templates/app-template-smc-control/server/config/foundation.ts` (deleted)
- `packages/templates/app-template-smc-control/server/config/index.ts`
- `packages/templates/app-template-smc-control/tests/client/foundation-integration.test.ts`
- `packages/templates/app-template-smc-control/tests/client/home.test.tsx`
- `packages/templates/app-template-smc-control/tests/client/settings-navigation.test.ts`
- `packages/templates/app-template-integration-demo/cli/plugins.ts`
- `packages/templates/app-template-integration-demo/client/lib/navigation-transform.ts`
- `packages/templates/app-template-integration-demo/client/pages/home/index.tsx`
- `packages/templates/app-template-integration-demo/client/pages/home/capabilities.ts` (added)
- `packages/templates/app-template-integration-demo/client/pages/home/prompt-dialog.tsx` (added)
- `packages/templates/app-template-integration-demo/client/plugins.ts`
- `packages/templates/app-template-integration-demo/client/runtime.ts`
- `packages/templates/app-template-integration-demo/package.json`
- `packages/templates/app-template-integration-demo/server/config/foundation.ts` (deleted)
- `packages/templates/app-template-integration-demo/server/config/index.ts`
- `packages/templates/app-template-integration-demo/tests/client/foundation-integration.test.ts`
- `packages/templates/app-template-integration-demo/tests/client/home.test.tsx`
- `packages/templates/app-template-integration-demo/tests/client/settings-navigation.test.ts`

## Verification

| Package                                   | typecheck | test                                                         | build |
| ----------------------------------------- | --------- | ------------------------------------------------------------ | ----- |
| `@superice/app-enterprise-portal`         | 0         | 1 (26 failed files / 82 passed, 108 files)                   | 0     |
| `@nocobase/app-meeting`                   | 0         | 1 (21 failed files / 116 passed, 137 files; 52 failed tests) | 0     |
| `@nocobase/app-template-smc-control`      | 0         | 1 (7 failed files / 106 passed, 113 files; 12 failed tests)  | 0     |
| `@nocobase/app-template-integration-demo` | 0         | 1 (7 failed files / 106 passed, 113 files; 12 failed tests)  | 0     |

Foundation client tests passed in all four packages: `foundation-integration.test.ts`, the Plugins case in `settings-navigation.test.ts`, Meeting and template `home.test.tsx`, and Portal `permission-workspace.test.ts` (specimen is `DATABASE_EXPLORER_ACCESS`, a page grant).

The first template builds exited 1 because Corepack selected pnpm 11.7.0 from those packages' `packageManager` field while the workspace requires 11.11.0. After aligning that field, both builds exited 0.

## Meeting start health

BLOCKED. `http://127.0.0.1:13000` is already held by `server/standalone.ts` (pid 51776) and `http://127.0.0.1:5173` by Vite for `packages/apps/app-enterprise-portal` (pid 7236). Meeting was not started, and those processes were not stopped.

## P0 exit

FAIL. Typecheck and build pass, and the Foundation v3 client contract is in place (no foundation config, no foundation CLI, `foundation()` with no options, Plugins at `/settings/plugins` under settings). The package `test` commands all exited 1. The shared server failure is `Invalid database driver "better-sqlite3" for dialect "postgres"`, because the workspace `.env` sets `DB_DIALECT=postgres` and the test app boots with the sqlite driver. That failure also skips several client suites that boot a server. Other client failures that remain are outside the Foundation tests (`permission-management-tabs`, `notification-template-address`, account-menu and auth mocks, and project build checks such as `asset-url-build` and `server-imports`). Meeting health was not run.
