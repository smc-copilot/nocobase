# Casdoor enterprise identity

Business applications in this repository share one Casdoor issuer and keep independent databases, sessions, and Permission Sets. This page is the runtime contract for that arrangement: what the plugin already does, and what an operator must still configure after boot.

## Architecture

Every business application trusts the same Casdoor issuer and resolves a person by the pair `issuer` + `subject`. The employee number is the business key. A verified `employeeNo` claim matches `user.username`, and an e-mail address never merges two local accounts. Each application stores its users, bindings, and sessions in its own database. A Casdoor login creates a session only in the application that completed the sign-in.

## Plugin capabilities

`@nocobase/app-plugin-casdoor-identity` implements the identity lifecycle. First login creates the local user and its `externalIdentities` binding in one transaction when admission allows it, and binds an existing user when `employeeNo` matches exactly one username. A repeat login reuses that binding. Admission evaluates the provider policy and refuses a disabled employee. Enabled mapping rules grant only Permission Sets listed on `casdoorIdentity.mappablePermissionSets`, and they never grant `root`. Grants are recorded in `managedPermissionAssignments`, and a later sync revokes only those recorded grants. Directory sync reconciles users on a schedule. Disabling an employee goes through `UserAdministrationService.disable`, which revokes that user's sessions. Administration routes live under `/api/casdoorIdentity/`.

## Runtime prerequisites

Registering the plugin does not insert the provider row, the admission policy, or the mapping rules. An operator configures those after the application is running, before a Casdoor user can sign in and receive roles.

- Enable an identity provider with `PUT /api/casdoorIdentity/providers/:providerId`. The stored `issuer` must equal `CASDOOR_ISSUER`, and `enabled` must be true. A token whose issuer has no enabled provider provisions nobody.
- Claim mapping uses the attribute `employeeNo` by default. Set `claimMapping.employeeNo` on that provider when Casdoor stores the employee number on another path. The plugin also reads `properties.employeeNo` when the mapped path is empty.
- Admission is deny-by-default. A missing policy, or a policy whose allow lists are all empty, admits nobody (`NOT_CONFIGURED`). Deny rules win over allow rules. Send `admissionPolicy` on the same provider request.
- Directory sync reads `CASDOOR_ENDPOINT`, `CASDOOR_ORGANIZATION`, `CASDOOR_CLIENT_ID`, and `CASDOOR_CLIENT_SECRET` from the environment. When all four are set, application config enables `directory` and `sync.enabled`. Without them the plugin has no directory source.
- `mappablePermissionSets` is application configuration. A mapping rule that names a set outside that list is refused. `root` stays off the list.

Browser sign-in requires `CASDOOR_ISSUER`, `CASDOOR_CLIENT_ID`, and `CASDOOR_CLIENT_SECRET` together. A partial set fails startup. `CASDOOR_AUDIENCE` and `CASDOOR_JWKS_URI` override the JWT checks. When `CASDOOR_JWKS_URI` is unset, JWKS defaults to `{CASDOOR_ISSUER}/.well-known/jwks`. Each application uses its own OAuth client. Client secrets stay in the private `.env`.

## How applications wire the plugin

Portal (`packages/apps/app-enterprise-portal`), Meeting (`packages/apps/app-meeting`), and applications generated from `packages/templates/app-template-smc-enterprise` register `@nocobase/app-plugin-casdoor-identity/server` in `server/plugins.ts`, declare `server/config/casdoor-identity.ts`, and attach that factory from `server/config/index.ts`. Browser OAuth is Better Auth `genericOAuth` with `createCasdoorBrowserOAuthConfig` in `server/config/auth.ts`, beside username, API key, device authorization, and bearer. Account linking stays off.

Meeting's `mappablePermissionSets` are `meeting-operator`, `meeting-oa-operator`, `meeting-oa-reconciler`, and the platform set `member`. The three Meeting sets are defined in `packages/apps/app-meeting/server/meetings/permission-sets.ts`. `member` is the authorization plugin's default set (`defaultSet: 'member'` in `server/config/authorization.ts`), seeded with empty grants by `packages/plugins/app-plugin-authorization/database/seeds/202608250002_authorization_create_member_set.ts`. The Meeting seed `accounts-manager` is local user administration and is omitted from directory mapping. `root` is omitted.

Portal ships `mappablePermissionSets: []`. Application source defines no business Permission Set. The name `task-member` appears only inside an authorization safety unit test, and settings ids such as `enterpriseAppPortal.catalog` are settings resources. Administrators set `casdoorIdentity.mappablePermissionSets` in Portal's `config.yml` before creating mapping rules.

`app-template-smc-enterprise` leaves `mappablePermissionSets` empty so a new application names its own keys. Its directory reader matches Portal and Meeting: `CASDOOR_ENDPOINT`, `CASDOOR_ORGANIZATION`, `CASDOOR_CLIENT_ID`, and `CASDOOR_CLIENT_SECRET` enable sync.

## OA LTPA and Casdoor in Meeting

Meeting registers OA LTPA (`oaLtpaAuth` in `server/config/auth.ts`, switched by `meetingOaSso`) and Casdoor as separate sign-in mechanisms. LTPA validates an OA cookie. Casdoor performs OIDC browser sign-in and verifies JWTs against the shared issuer. Either mechanism can be enabled on its own, and the two credential types stay distinct.

## Cross-application single sign-on

The browser signs in at Casdoor. Each application then runs its own OpenID Connect authorization-code flow against that issuer and stores the resulting session in its own database. Single sign-on is the Casdoor session. One application's NocoBase session cookie does not sign the user into another application.

## Tests

Plugin coverage is under `packages/plugins/app-plugin-casdoor-identity/tests/server/`. Provisioning and employee-number binding are `identity-provisioning.test.ts` and `external-identity-bindings.test.ts`. Admission is `identity-admission.test.ts`. Permission mapping is `permission-mapping.test.ts`. Directory sync and session revoke are `identity-sync.test.ts`. Login, JWT verification, browser OAuth, and admin routes are `login-flow.test.ts`, `credential-resolver.test.ts`, `browser-oauth.test.ts`, and `admin-routes.test.ts`. Run `pnpm --filter @nocobase/app-plugin-casdoor-identity test`. Meeting wiring is `packages/apps/app-meeting/tests/server/casdoor-identity-config.test.ts`. Portal wiring is `packages/apps/app-enterprise-portal/tests/server/casdoor-identity-config.test.ts`.
