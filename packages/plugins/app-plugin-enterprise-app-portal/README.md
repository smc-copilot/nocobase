# Enterprise App Portal

Employee application catalog, Casdoor fail-closed access, launch, preferences, health and audit for NocoBase 3.

Pages that render this API belong to the installing application (`@superice/app-enterprise-portal`). This plugin does not ship Client routes.

## Authorization

Casdoor is the application-access authority. The administrator catalog and local Permission Sets never grant launch. `enterpriseAppPortal.access.source` defaults to `unconfigured` and answers `503` with reason `CASDOOR_AUTHORIZATION_UNAVAILABLE`.

`contractFixture` is isolation-only. Do not point it at a live IdP.

Direct application grants are Casdoor Permission rows named `nocobase-portal-app-<applicationName>`, with resource type Application, action Read, effect Allow and state Approved. A grant update rewrites only that row's user list. Group and role access stays, and permissions outside the prefix are left alone. `source` is `direct` when the user id is on the permission, and `inherited` when enforce still allows the user through a group, role, or wildcard.

Management credentials are the `CASDOOR_CLIENT_ID` and `CASDOOR_CLIENT_SECRET` environment variables. Override those names with `access.managementApi.clientIdEnv` and `clientSecretEnv`. The endpoint, organization, application owner and permission owner come from `access.managementApi` or from `CASDOOR_ENDPOINT`, `CASDOOR_ORGANIZATION`, `CASDOOR_APPLICATION_OWNER` and `CASDOOR_PERMISSION_OWNER`. Default auth sends the client id and secret on the query string. Set `access.managementApi.auth` to `clientCredentials` to exchange them for a bearer token. Casdoor errors fail closed.

## HTTP API

All routes sit under `/api/enterpriseAppPortal` and require a signed-in session.

| Method         | Path                                            | Who                                                    |
| -------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `GET`          | `/applications`                                 | signed-in employee                                     |
| `POST`         | `/applications/{appCode}/launch`                | signed-in employee                                     |
| `GET` / `PUT`  | `/preferences`                                  | signed-in employee                                     |
| `GET` / `POST` | `/admin/applications`                           | `enterpriseAppPortal.catalog`                          |
| `PATCH`        | `/admin/applications/{appCode}`                 | `enterpriseAppPortal.catalog` configure                |
| `GET`          | `/admin/auditEvents`                            | `enterpriseAppPortal.audit` read                       |
| `POST`         | `/admin/casdoor/testConnection`                 | `enterpriseAppPortal.casdoor` read                     |
| `GET`          | `/admin/casdoor/users`                          | `enterpriseAppPortal.casdoor` read                     |
| `GET`          | `/admin/casdoor/applications`                   | `enterpriseAppPortal.casdoor` read                     |
| `GET` / `PUT`  | `/admin/users/{owner}/{name}/applicationGrants` | `enterpriseAppPortal.casdoor` read, configure on `PUT` |

The Casdoor user id is `{owner}/{name}` because that id contains a slash.

Launch returns `{ data: { url } }`. It is not an HTTP redirect.

## Secrets

Client secrets, Casdoor tokens and Management API credentials never leave the server. Audit rows store action, result and reason only.
