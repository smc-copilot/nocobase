# ADR-004: NocoBase enterprise identity client

| Field    | Value                                                 |
| -------- | ----------------------------------------------------- |
| Status   | Proposed                                              |
| Date     | 2026-11-28                                            |
| Branch   | `feat/v3-enterprise-identity-hub`                     |
| Baseline | `e4d399b6ee` (P0 commit `95e7b0cc60`)                 |
| PRD      | 17.4, with 9.3, 9.4, 10.2, 10.3, 10.6, 11.3, and 12.2 |

## Context

Business apps need one way to accept a Broker login, resolve a Hub `personId`, and keep a local user. Today that behavior is inside `@nocobase/app-plugin-casdoor-identity`, which knows Casdoor claims and writes `externalIdentities` in the app database. Portal registers that plugin. Meeting keeps a separate OA LTPA login and does not register it. PRD 12.1 names a future `app-plugin-enterprise-identity-client` so a new app can attach to the Hub and Broker without a Casdoor-specific dependency.

This ADR specifies that future plugin. P1 does not create the package, does not change authentication code, and does not assemble `app-template-smc-enterprise`.

## Decision

The client is a later package, `@nocobase/app-plugin-enterprise-identity-client`, installed by each business app that joins the Hub. It is an OIDC relying party and a local projection writer. It is not an identity provider, and it does not read the Hub database. Casdoor directory calls stay in the Casdoor adapter. New apps do not take a hard dependency on `@nocobase/app-plugin-casdoor-identity`. Portal's existing Casdoor login remains until a migration stage switches it. Meeting's OA LTPA path stays a different mechanism and is not folded into this client in P1.

### How the client extends Better Auth

The client verifies the OIDC token on the application server during the authorization-code exchange, and again when a caller presents a bearer token the app has agreed to accept. The browser does not verify signatures.

Required checks are issuer, audience, signature against the Broker JWKS, `exp`, `iat`, nonce, and state. Discovery comes from the configured issuer. The flow is authorization code with PKCE S256. Implicit flow and resource-owner password flow are not defaults. Redirect URIs are an exact allow list. Each app has its own client id and its own secret or `private_key_jwt` material.

The client integrates as an authentication method beside the existing credential and generic OAuth hooks, the same layer Casdoor and OA LTPA already use to create a Better Auth session after they trust an upstream identity. The exact registration function is chosen when the package is built, against the authentication plugin's public extension points at that time. If those points cannot verify an ID token safely, the work stops and adds a supported extension. It does not fork Better Auth tables.

### personId claim

Under the preferred ADR-002 contract, `sub` is the Hub `personId`. The client uses `sub` as `personId` in that mode.

If a Broker cannot set `sub` to `personId`, the Hub mapping mode applies. The client then reads a signed `person_id` claim whose value is the Hub `personId`, and it treats `sub` as the Broker subject that must already exist in the Hub mapping. Email, employee number, and display name are never accepted as `personId`. Optional claims (`employee_no`, `organization_id`, `department_id`, `groups`, `person_version`, `membership_revision`, `identity_source`) update projection hints only. They do not select the Person.

An end user cannot edit `personId` on the binding. Membership and Person status are taken from the token claims plus a Hub check when the client is configured to re-read status. The token alone is not the long-term revoke mechanism (ADR-003).

### Passwordless local user

`UserAdministrationService.create` requires a `password` and then writes a `credential` account. That API is for a person who will sign in with a local password. The client does not call it, and it does not invent a random, shared, or default password to satisfy it.

`createServiceAccount` creates `kind: service` with no password and an address that cannot receive mail. Those accounts cannot sign in interactively. The client does not use them as human projections.

The passwordless projection follows the path already used by Casdoor provisioning in `identity-provisioning.ts`: obtain an administration context bound to the same transaction and call `internalAdapter.createUser` with name, email when the app can store it, and `disabledAt: null`, and do not call `createAccount` for a password. The formal `ExternalUserProvisioningService` in PRD 9.4 is still a proposed Authentication API. Until that API exists, `internalAdapter.createUser` is the allowed creation path because it is the adapter the authentication plugin itself uses. Direct SQL against Better Auth `user`, `account`, and `session` tables is not allowed.

Local username is chosen by the app. It may differ from `employeeNo`. Email is written only when the app's unique constraint can accept it. A collision on email fails that projection and surfaces a conflict. It does not merge two Persons.

### AppUserBinding

The client owns `AppUserBinding` in the app database, as ADR-003 describes. First login looks up `personId`. When the binding exists, the client loads that local user, refuses the login when the binding or the Person or the membership is not active, and then creates a session. When the binding is missing, the client creates the local user and the binding in one transaction. A unique `personId` makes a concurrent first login fail one of the two transactions. The loser reads the winning binding and continues with that local user. The same pattern already exists around the Casdoor plugin's unique subject insert.

The binding table is the client's table. The client does not reuse `externalIdentities`, which remains the Casdoor plugin's store, so the two mechanisms can run side by side during migration.

### Session create and revoke

After a successful projection, the client creates the app session through `internalAdapter.createSession`, which is the same family of call OA LTPA and the authentication plugin already use. The session row and the cookie belong to this app. Cookies are host-only unless a reviewed shared-parent-domain design exists. They are HTTPS, HttpOnly, and Secure in deployed environments, with a SameSite value the app already uses for its auth cookie.

Revoke uses `internalAdapter.deleteUserSessions` for that local user. Person disable and membership revoke for this app both revoke sessions. Person disable also sets the local user disabled. Membership revoke disables access to this app and does not tell other apps to do anything. Those other apps hear their own events. Re-enable clears the disabled flag and does not recreate deleted sessions. App logout revokes the current app session. Global logout additionally calls the Broker end-session endpoint when the Broker supports it. Back-channel logout is a Broker requirement from PRD 10.2 and is unverified.

### Internal event interface

The client exposes an internal handler for Hub lifecycle events. Ordinary browser sessions cannot call it. The caller is a registered Hub service identity, authenticated with mTLS or `private_key_jwt` or an equivalent server credential. The handler requires `eventId`, `appId`, `personId`, `sourceRevision`, and `eventType`. A repeated `eventId` returns the previous result. The handler rejects an `appId` that is not this deployment.

Repository HTTP rules will name the routes when the package exists. The likely namespace is `/api/enterpriseIdentity/...`. The PRD examples `POST /api/enterpriseIdentity/provision`, `POST /api/enterpriseIdentity/events`, `GET /api/enterpriseIdentity/status`, and `POST /api/enterpriseIdentity/reconcile` are the semantic set, not a promise of those exact strings if the HTTP rule needs a camelCase adjustment. Events are also consumed from the message broker with `inbox: true` when the app is subscribed directly. The HTTP handler and the inbox consumer share one idempotent apply function.

### Configuration and secrets

Each app's configuration section carries its issuer, client id, redirect URIs, post-logout redirect URIs, audience, and a secret reference for the client secret or private key. Secret fields use the application config `env` mapping marked secret. They are not committed. The Hub database URL, Broker admin password, and other apps' client secrets are not injected here.

Environments do not share client credentials. A dev app points at a dev issuer and a dev client. Production credentials are absent from dev configuration.

### Template assembly

A later enterprise template registers this client, authentication, and authorization together. P1 does not add `app-template-smc-enterprise` and does not change `app-template-smc-control`. Control-specific pages stay on the control template. The template is the place a new app inherits the client. It is not a shortcut that copies Casdoor configuration into every package.

### Version compatibility

The client declares `@nocobase/app-server`, `@nocobase/db`, authentication, authorization, and message-broker as peer dependencies, using the identity-sensitive peer rule. It imports service tokens from the package that defines them. It does not construct a second token object with the same name.

Event apply accepts `payloadVersion` 1 and rejects an unknown version into the reconcile path. When the Broker product is chosen, the client records the issuer and the tested product version in its configuration documentation. This ADR does not record a Broker version, because no Broker was tested.

## Consequences

P5, not P2, builds this plugin. P2 stops at Hub data and Hub services. Apps keep their current login. The passwordless rule is fixed now so P2 does not grow a Hub-side password column "for later" and so the client author does not call `UserAdministrationService.create`.

## Open questions

The precise authentication-plugin extension point for an OIDC relying party at the time P5 starts. Whether Authentication will grow the PRD `ExternalUserProvisioningService` before then, which would replace direct `internalAdapter.createUser` calls while keeping the same no-password, no-SQL rule. Whether the selected Broker signs a `person_id` claim or uses `sub`. How the Hub authenticates to the internal event route.
