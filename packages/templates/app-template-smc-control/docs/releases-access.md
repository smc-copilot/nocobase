# Release management access in SMC Control

The Releases plugin declares what can be granted. This application binds `releasesAccessToken` in `server/providers/releases-access.ts` (mapping logic in `server/lib/releases-permissions.ts`) so those grants come from Authorization Permission Sets.

## Permission Sets

| Permission Set   | Releases reach                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `root`           | Everything on every App (`allPermissions`)                                                                                      |
| `platform-admin` | Same as `root` for release management                                                                                           |
| `publisher`      | Related Apps (creator-owned by default): view, logs, configure, upload, deploy, operate; may create Apps; may read environments |
| Any other set    | Nothing (`noPermissions`)                                                                                                       |

Create `platform-admin` and `publisher` in the Authorization UI (or seeds) and assign users. The built-in `root` set already maps to unrestricted release access.

## Client pages

Release UI comes from `@nocobase/app-plugin-releases/client` at `/releases` and `/release-environments`. This template does not add custom React pages for Releases.
