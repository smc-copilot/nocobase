# Enterprise App Portal

Employee application catalog, Casdoor fail-closed access, launch, preferences, health and audit for NocoBase 3.

Pages that render this API belong to the installing application (`@superice/app-enterprise-portal`). This plugin does not ship Client routes.

## Authorization

Casdoor is the application-access authority. The administrator catalog and local Permission Sets never grant launch. `enterpriseAppPortal.access.source` defaults to `unconfigured` and answers `503` with reason `CASDOOR_AUTHORIZATION_UNAVAILABLE`.

`contractFixture` is isolation-only. Do not point it at a live IdP.

## HTTP API

All routes sit under `/api/enterpriseAppPortal` and require a signed-in session.

| Method         | Path                             | Who                                     |
| -------------- | -------------------------------- | --------------------------------------- |
| `GET`          | `/applications`                  | signed-in employee                      |
| `POST`         | `/applications/{appCode}/launch` | signed-in employee                      |
| `GET` / `PUT`  | `/preferences`                   | signed-in employee                      |
| `GET` / `POST` | `/admin/applications`            | `enterpriseAppPortal.catalog`           |
| `PATCH`        | `/admin/applications/{appCode}`  | `enterpriseAppPortal.catalog` configure |
| `GET`          | `/admin/auditEvents`             | `enterpriseAppPortal.audit` read        |

Launch returns `{ data: { url } }`. It is not an HTTP redirect.

## Secrets

Client secrets, Casdoor tokens and Management API credentials never leave the server. Audit rows store action, result and reason only.
