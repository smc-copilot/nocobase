# @nocobase/app-plugin-casdoor-identity

Casdoor (and compatible OIDC) identity for NocoBase applications: JWT credential resolution, first-login provisioning, admission policy, Permission Set mapping, directory sync and Octop subject pre-binding.

## Credential resolution

At boot the server provider registers `Auth.addCredentialResolver()`:

1. Read `Authorization: Bearer` (only when its unverified `iss` is the configured issuer) or `X-Casdoor-Access-Token`
2. Verify the JWT with JWKS (`casdoorIdentity.issuer`, `audience`, `jwksUri` or static `jwks`)
3. Resolve `iss` + `sub` through the `externalIdentities` collection, provisioning the local user on the first admitted login
4. Return an issued credential for the bound local user

Casdoor credentials are admitted only on routes that name `casdoorAccessToken` in their `describeRoute().security` and call `auth.required({ scopedKeys: true })`. `GET /api/casdoorIdentity/me` is the demo route.

## Identity administration (P2)

| Capability                          | Behavior                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First login (IAM-001)               | The local user and its `externalIdentities` binding commit in one transaction, keyed by the unique `(issuer, subject)`; concurrent first logins create one user.                                     |
| Repeat login (IAM-002)              | The stable identity is reused; name changes follow, e-mail changes never create a second account.                                                                                                    |
| Admission (IAM-003)                 | Per provider (`identityProviders.admissionPolicy`): allow by organization, group, subject, or verified e-mail; deny rules win; a policy with no allow entries admits nobody.                         |
| Permission mapping (IAM-004/005)    | Enabled rules map trusted attributes to Permission Sets on `casdoorIdentity.mappablePermissionSets`, never `root`. Grants are recorded in `managedPermissionAssignments` and only those are revoked. |
| Sync (IAM-006)                      | Login-time check plus periodic reconciliation registered with the Scheduler plugin (`casdoor-identity-sync`); an optional in-process timer is the fallback when Scheduler is absent.                 |
| Disable and re-enable (IAM-007/008) | Sync disables through `UserAdministrationService.disable` (sessions and realtime revoked). Re-enable clears the flag only for users the sync disabled and restores no session.                       |
| Admin APIs (IAM-009/010)            | Sync status and runs, read-only preview, batch run and rerun, providers (secrets write-only), mapping rules, and subject binding import preview and commit, all audited.                             |

Administration routes live under `/api/casdoorIdentity/` and check three `authz.settings` items: `casdoorIdentity.sync` (`read`, `run`), `casdoorIdentity.mapping` (`read`, `configure`) and `casdoorIdentity.subjectBindings` (`read`, `import`). They are placed under an Identity subsection of the administration workspace. The pages that render them belong to the installing application.

## Configuration

```yaml
casdoorIdentity:
  issuer: https://sso.example.com
  audience: nocobase-app
  jwksUri: https://sso.example.com/.well-known/jwks
  # Permission Sets a mapping rule may grant. Empty means none.
  mappablePermissionSets:
    - content-editor
  directory:
    endpoint: https://sso.example.com
    organization: acme
    clientId: nocobase-sync
    clientSecret: set-through-the-environment
  sync:
    cron: '*/15 * * * *'
    timezone: UTC
    # fallbackIntervalSeconds: 900   # only used when the Scheduler plugin is not registered
```

An application may register its own source with `identityDirectoryToken` instead of `directory`. Providers, mapping rules and admission policies are data managed through the admin API, not configuration.

Browser sign-in through Better Auth `genericOAuth` is described in [docs/generic-oauth-wiring.md](docs/generic-oauth-wiring.md).

## Tests

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity test
```

CI uses an ephemeral RSA keypair, local JWKS and an in-memory directory. Live Casdoor verification is a separate evidence step; see `prd/acceptance/p0/README.md` and `prd/acceptance/p2/README.md`.
