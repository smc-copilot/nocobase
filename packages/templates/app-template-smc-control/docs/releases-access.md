# Release management access in SMC Control

The Releases plugin declares what can be granted. This application binds `releasesAccessToken` in `server/providers/releases-access.ts` (mapping logic in `server/lib/releases-permissions.ts`) so those grants come from Authorization Permission Sets.

## Permission Sets

| Permission Set   | Releases reach                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `root`           | Everything on every App (`allPermissions`)                                                                                      |
| `platform-admin` | Same as `root` for release management                                                                                           |
| `publisher`      | Related Apps (creator-owned by default): view, logs, configure, upload, deploy, operate; may create Apps; may read environments |
| Any other set    | Nothing (`noPermissions`)                                                                                                       |

Create `platform-admin` and `publisher` in the Authorization UI (Users / Permission Sets under System settings) and assign users. The built-in `root` set already maps to unrestricted release access.

## Dual configuration (required)

A non-root publisher must hold **both**:

1. Authorization grants from `publisherAuthorizationGrants()` — including native `page:rel-apps/access`, related `rel.apps/*` actions, and `rel.environments` read.
2. The Permission Set key `publisher`, so `ReleasesAccess.permissionsOf` returns `pages['rel-apps']=true` and related App scopes.

Holding only the ReleasesAccess page flag (or only the Authorization page grant) is not enough: the client route checks `page:rel-apps/access`, and the Releases API checks `ReleasesAccess`. Gate A covers this with `tests/server/publisher-releases-boundary.test.ts`.

## Client pages

- Users and Permission Set administration: `client/pages/settings/routes.ts` (registered from `client/routes.ts`).
- Release UI: `@nocobase/app-plugin-releases/client` at `/releases` and `/release-environments`. This template does not add custom React pages for Releases.
