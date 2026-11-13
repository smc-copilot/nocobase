---
name: nocobase-app-plugin-casdoor-identity
description: Register the Casdoor identity plugin in a NocoBase 3 App to accept Casdoor JWTs, provision and bind users on first login, map trusted attributes to Permission Sets, reconcile users with the directory on a schedule, and pre-bind Octop subjects.
---

# Casdoor Identity App Plugin

## Use this Skill when

An App must accept Casdoor (or another OIDC provider's) access tokens as credentials, create local users from admitted external identities, keep their enabled state and Permission Sets in step with the identity provider, or import controlled Octop subject bindings.

## Public surfaces

- Server plugin `@nocobase/app-plugin-casdoor-identity/server`; service tokens `casdoorIdentityAdminToken` and `identityDirectoryToken` from `@nocobase/app-plugin-casdoor-identity/server/tokens`.
- `casdoorIdentity` configuration: `issuer`, `audience`, `jwksUri` or `jwks`, `mappablePermissionSets`, `directory`, `sync`.
- Admin API under `/api/casdoorIdentity/` (`syncStatus`, `syncRuns`, `providers`, `mappingRules`, `subjectBindings`), documented in the App's API document.
- `authz.settings` items `casdoorIdentity.sync`, `casdoorIdentity.mapping`, `casdoorIdentity.subjectBindings`.

## Prerequisites

Register the Authentication and Authorization plugins first; register the Scheduler plugin for periodic sync. Create an identity provider through `PUT /api/casdoorIdentity/providers/{providerId}` with an admission policy. A provider without an admission allow entry admits nobody, and an issuer without a provider provisions nobody.

## App workflow

1. Configure `casdoorIdentity.issuer`, `audience` and `jwksUri`.
2. Create the provider and its admission policy.
3. List the Permission Sets mapping may grant in `mappablePermissionSets`, then create mapping rules.
4. Configure `directory` (or register `identityDirectoryToken`) to enable periodic sync; preview a run before the first real one.
5. Grant administrators the settings items above through a Permission Set.

## Ownership

The plugin owns `externalIdentities`, `identityProviders`, `identityMappingRules`, `managedPermissionAssignments`, `identitySyncRuns`, `businessUiSubjectBindings` and `identityAuditEvents`. The App owns its Permission Sets, the pages that call the admin API and the Better Auth sign-in methods. The plugin revokes only the Permission Set assignments it recorded in `managedPermissionAssignments`; assignments made by a person are never read as its own.

## Permissions and constraints

- Authentication: a session for every admin route; Casdoor tokens are admitted only on `/api/casdoorIdentity/me`-style routes that opt in with `required({ scopedKeys: true })`.
- Authorization: each admin route checks its settings item before it reads anything.
- Mapping never grants `root` or an unrestricted set, and a token string cannot name a Permission Set.
- A different subject with an e-mail that already belongs to a local user is refused (`IDENTITY_EMAIL_CONFLICT`), never merged.
- Provider secrets are write-only; reads report `secretConfigured`.

## Verification

Observable behavior: the first admitted token creates one user; a repeat token reuses it; a disabled user's token answers 403 `ACCOUNT_DISABLED`; a sync run lists its counts and per-user actions in `GET /api/casdoorIdentity/syncRuns`; a subject binding import answers 409 `SUBJECT_BINDING_CONFLICTS` with a per-row report and writes nothing.
