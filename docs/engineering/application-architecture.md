# Application architecture

## Layers

| Layer | Location | Rule |
| --- | --- | --- |
| Business app | `packages/apps/app-*` | Independent install, config, migrations, build, and deploy. Must not import another business app. |
| Plugins | `packages/plugins/*` | Optional or required capabilities declared through workspace dependencies and extension points. |
| Templates | `packages/templates/*` | New-app starting points; no customer runtime config or business data as defaults. |
| Shared libraries | `packages/libs/*` and other public packages | No reverse dependency on a business app. |
| Tools | `packages/tools/*` | create-app, builder, installer; prefer thin wrappers for this repository's contracts. |
| Deployment catalog | `deployment/` | Non-secret engineering facts only (app identity, platform baseline, release-manifest schema). |

## Identity

App key, directory name (`packages/apps/app-<key>`), npm `packageName`, product display name, and deploy instance name are different concepts. Existing package names stay as registered:

- `enterprise-portal` → `@superice/app-enterprise-portal`
- `meeting` → `@nocobase/app-meeting`

Casdoor, Agent Authorization, Business UI Adapter, and Octop are optional per app. Meeting keeps OA/meeting scope and `user.username` employee identity.

## Databases

PostgreSQL is the production-supported database for new business apps. SQLite is local development/demo only and is not a production support claim.
