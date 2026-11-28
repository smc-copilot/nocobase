# ADR-001: Identity Center and Broker boundary

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Status   | Proposed                              |
| Date     | 2026-11-28                            |
| Branch   | `feat/v3-enterprise-identity-hub`     |
| Baseline | `e4d399b6ee` (P0 commit `95e7b0cc60`) |
| PRD      | 17.1, with 5.2, 5.3, and 5.4          |

## Context

PRD section 5.2 allows two deployment modes. Mode A is one IAM product that is both the Person directory and the OIDC Broker. Mode B is an Identity Hub that owns Person master data, with a mature IAM product limited to authentication and the OIDC protocol. A third state is rejected: the Hub and the Broker each holding an employee record that can change independently with no reliable reconciliation.

The fork already has `@nocobase/app-plugin-casdoor-identity`. That plugin logs a user in through Casdoor and stores an app-local `externalIdentities` row from `providerIssuer` + `providerSubject` to `localUserId`. Portal uses it. Meeting does not. The corrective architecture note still describes every business app sharing one Casdoor center. This ADR treats that note as the current pressure, and the Identity Hub PRD as the target, and it does not pretend the live Casdoor instance was re-tested here.

The POC environment for this pass contains only the existing Casdoor test instance. This pass did not call it. Keycloak, Authentik, LDAP/Active Directory, and a second OIDC provider were not available.

## Decision

The working hypothesis is Mode B.

The Enterprise Identity Hub is the sole Person master-data authority. App Membership, identity links, admission, audit, and lifecycle facts are Hub data. The Identity Broker is a replaceable OIDC provider that issues tokens whose stable subject maps to a Hub `personId`. The Broker product is undecided.

Business apps depend on the future enterprise identity client and on Hub contracts. They do not embed Casdoor, Keycloak, or Authentik administration APIs. `@nocobase/app-plugin-casdoor-identity` stays in place for Portal until a later migration stage. New Hub code does not treat Casdoor user records as Person rows.

Mode A is not selected. It can be reopened only after a POC shows one product covering Person authority, manual create, multi-provider link, App Membership (or a proven equivalent), an administration API, lifecycle events, and audit. Login success alone does not qualify. That evidence does not exist in this pass.

## Answers to PRD 17.1

### 1. Can Casdoor be the enterprise Person authority?

Not proven. The repository shows Casdoor as an OIDC login source for one application, with the local user and the external binding stored in that application's database. There is no Hub Person table, and this pass observed no Casdoor organization that this repository treats as the employee system of record. Casdoor might hold users in its own database. That arrangement is not evidence that Casdoor is the enterprise Person authority, and this pass did not read the test instance to inspect one.

### 2. Can Casdoor federate multiple identity sources and link them to one person?

Not proven. The Casdoor plugin binds one issuer and subject to one local user inside one app. It rejects provisioning when another local user already owns the same email, which avoids a silent merge in that app. It does not show two providers (LDAP and an OIDC issuer, or two OIDC issuers) attached to one immutable enterprise person, and it does not show that link surviving across Portal and Meeting. A second OIDC provider was not available, so POC-05 is BLOCKED.

### 3. Can Casdoor connect LDAP/Active Directory and synchronize a directory?

Not proven, and not testable here. No LDAP or Active Directory directory was available. This pass did not enable a Casdoor sync, and it did not inspect Casdoor sync configuration on the test instance.

### 4. Can App Membership be managed through an API, or an equivalent?

Not proven. PRD App Membership is a relationship between a Person and one business app, and it is separate from that app's permission sets. The Casdoor plugin has an admission policy that decides whether an external identity may provision a local user. Admission is a different decision. This pass found no Casdoor-backed membership resource that can grant Portal while leaving Meeting revoked for the same person.

### 5. Are lifecycle events, webhooks, or a reliable poll available?

Not proven for Casdoor. This pass captured no Casdoor webhook, event log, or poll cursor. The repository does have a transactional outbox in `@nocobase/app-plugin-message-broker`. That outbox belongs to a NocoBase application. It is the mechanism ADR-003 assigns to Hub lifecycle events. It is not a Casdoor event API.

### 6. Is Keycloak a better Broker?

Unknown. No Keycloak instance was available. This ADR does not rank Keycloak above or below Casdoor as a Broker. LDAP federation, multiple OIDC identity providers, account linking, client management, and events remain untested.

### 7. Does Authentik meet the directory and federation requirements?

Unknown. No Authentik instance was available. Directory, authentication flow, user directory, application onboarding, and administration API remain untested.

### 8. Is a self-built Identity Hub plus an external Broker required?

Yes, as the working hypothesis. The available evidence shows an app-local Casdoor login binding, and it does not show a product that already owns Person master data, multi-provider links, App Membership, and lifecycle events together. The Hub is therefore proposed as the authority. An external Broker is still required for OIDC, because the PRD forbids writing an OIDC provider's signing and protocol code from scratch. Which product plays that Broker role is an open selection.

## What the Hub owns, and what the Broker owns

The Hub owns Person, PersonIdentity, IdentityProvider registry, organization and department, AppRegistry, AppMembership, audit, conflict records, admission policy, attribute authority, and the optional Broker-subject mapping. The Broker owns browser login, sessions at the issuer, authorization-code and token issuance, JWKS, client registration, and logout. The Broker stores whatever user record its product requires in its own store. That record is an authentication projection. The Hub `personId` wins when the two disagree. Reconciliation must be able to rebuild the projection from the Hub.

Provider secrets stay in a secret reference. The Hub database connection string is not injected into Portal, Meeting, or any later business app. Each app receives only its own OIDC client credentials.

## Database, backup, secrets, and availability

These items were on the P1 task list and are not decided.

The identity center uses its own database, separate from each business app. PostgreSQL is the production database family this fork already states for new business apps. The host, the backup schedule, the restore drill, key custody, and the availability topology are undeclared because the Broker product is undeclared and no production identity database is created in P1. Broker storage, keys, and backups stay with the Broker product once one is chosen, and they are recorded separately from the Hub backup. Until that record exists, P2 uses test databases only.

## Consequences

P2 may build a provider-neutral Hub core. P2 does not install Casdoor to create a Person, does not register Portal or Meeting against a Broker, and does not import production users. Casdoor remains an optional adapter behind a provider interface, implemented in a later stage if it is still wanted. Selecting Keycloak or Authentik requires a POC against the same scenarios, on an instance this environment does not have today.

## Open questions

Which product is the Broker. Whether that product can set the OIDC `sub` claim to `personId`, or whether the Hub must keep the opaque mapping in ADR-002. How Hub lifecycle messages reach another application's process. The message-broker plugin can publish beyond one process, and the concrete middleware is not chosen. Where the identity center is deployed, and how its database is backed up and restored.
