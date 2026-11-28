# AppOps identity profile

Business instances that share the enterprise identity center use the profile name `casdoor-enterprise`. The production AppOps tree `/home/smc/workspace/nocobase-appops-v1.0.0` was not reachable from this Windows workstation. This page is the contract. Operators apply it in AppOps.

## Profile

Set `identityProfile` to `casdoor-enterprise`.

## Shared identity center

Every instance on this profile references the same identity center. These values name that center. The OAuth client id and secret stay on the instance.

- `CASDOOR_ISSUER`
- `CASDOOR_AUDIENCE`
- `CASDOOR_JWKS_URI`
- `CASDOOR_ENDPOINT`
- `CASDOOR_ORGANIZATION`

## Per instance

Each instance sets its own public origin, listen port, database, storage directory, and OAuth client:

- `APP_PUBLIC_ORIGIN`
- `APP_SERVER_PORT`
- `DATABASE_URL`
- `STORAGE_DIR`
- `CASDOOR_CLIENT_ID`
- `CASDOOR_CLIENT_SECRET`

`CASDOOR_CLIENT_ID` and `CASDOOR_CLIENT_SECRET` belong to that instance's Casdoor application. A second instance gets a second client.

## Forbidden

- A shared business database across applications.
- A shared NocoBase session cookie across applications.
- A shared Casdoor client secret across applications.

## Browser single sign-on

The browser signs in through Casdoor OpenID Connect. After Casdoor has a session, each application completes its own authorization-code login and issues its own session. That is the single sign-on path for `casdoor-enterprise`.

See also [casdoor-enterprise-identity.md](casdoor-enterprise-identity.md) for the application runtime prerequisites behind this profile.
