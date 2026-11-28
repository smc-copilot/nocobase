# P1 exit checklist

| Field     | Value                                |
| --------- | ------------------------------------ |
| Stage     | P1 architecture decision and IAM POC |
| Date      | 2026-11-28                           |
| Branch    | `feat/v3-enterprise-identity-hub`    |
| Baseline  | `e4d399b6ee`                         |
| P0 commit | `95e7b0cc60`                         |
| Result    | Not exited                           |

P1's job in PRD 18.2 is to freeze the Person authority, the Broker product, and the data ownership before anyone builds the wrong model. This pack freezes a **working hypothesis** and records the missing evidence. It does not freeze an Accepted design. PRD 18.2 also says that until P1 has passed, no formal production identity database migration is created. That prohibition still stands.

## Checklist

| #   | Exit condition                                                                                  | Result                 | Notes                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One Person master-data authority is named                                                       | Proposed, not Accepted | The authority is the Enterprise Identity Hub. Casdoor is not that authority on current evidence. ADR-001.                                                                                      |
| 2   | A Broker product, or a Hub + Broker pair, is named                                              | Partial                | Mode B (Hub + Broker) is the working hypothesis. The Broker product is undecided. Keycloak and Authentik were not available.                                                                   |
| 3   | POC-01 through POC-14 have real evidence                                                        | Not met                | Statuses are NOT RUN, BLOCKED, or absent. No PASS and no FAIL. [poc-plan.md](poc-plan.md).                                                                                                     |
| 4   | Capabilities the products cannot meet, and the build scope that replaces them, are written down | Met as documentation   | Person, multi-provider link, App Membership, and lifecycle events are Hub scope because they are unproven on Casdoor. OIDC protocol stays with a future Broker. The client is a later package. |
| 5   | Unproven product behavior is not written into an implementation                                 | Met for this pass      | Docs only. Status Proposed. No plugin code, no migration, no vendor SDK.                                                                                                                       |
| 6   | No production IAM-bound migration                                                               | Met                    | No migration files in this stage. Do not add one while these ADRs stay Proposed.                                                                                                               |

## Decisions a later stage may rely on

These are Proposed, and they are the only identity decisions P2 should encode.

Person authority is the Hub. `personId` is an immutable UUID. Identities are unique on (`providerId`, `identityKey`) while active or pending. Email does not auto-merge. Employee number is unique per organization. Merge requires an audit event and an alias. Broker `sub` is `personId`, or an opaque Hub mapping if the eventual Broker cannot do that. App Membership is not a permission set. `AppUserBinding` lives in each app database. Lifecycle events use `@nocobase/app-plugin-message-broker` `publish(message, { transaction })` and the existing `messageBrokerOutbox` collection. Passwordless local users, when a client exists, are created with `internalAdapter.createUser`, not with `UserAdministrationService.create`.

## Implications for P2

P2 builds the provider-neutral Hub core only. That core is Person, PersonIdentity, provider registry, organization and department, AppRegistry, AppMembership, audit, conflict handling, admission, attribute lock, and link, unlink, and merge services. Creating a Person must work with no Casdoor plugin installed.

P2 does not wire Portal or Meeting, does not choose or call a Broker, does not issue OIDC tokens, and does not ship `app-plugin-enterprise-identity-client`. P2 does not import production users and does not point a migration at a production IAM database. Test databases and migration tests are in scope. A migration that assumes Casdoor, Keycloak, or Authentik is the Person store is out of scope.

P2 publishes lifecycle events through the message-broker outbox inside the same transaction as the Hub write. It does not create a second outbox table. Dead-letter and manual replay remain the open gap in ADR-003. If P2 cannot meet PRD 11.4's dead-letter sentence with the current plugin, it records that limit in the P2 report. It does not quietly add `provisioningOutbox`.

Repository constraints the PRD's example names collide with:

Table names need an `identityHub` prefix. The Casdoor plugin already uses `identityProviders` and `identityAuditEvents`. HTTP routes use `/api/identityHub/...`, camelCase, with no `/v1` segment. The PRD paths under `/api/identity/v1/` stay semantic examples.

The optional Broker-subject mapping may exist as Hub data. It stays empty of vendor subjects until a Broker is Accepted.

## What Acceptance still requires

A reviewer accepts ADR-001 through ADR-004, or replaces them. POC rows that are NOT RUN get a real run, including a read-only Casdoor discovery check if the test instance is confirmed safe. Rows that are BLOCKED stay blocked until LDAP, a second OIDC provider, and a Broker candidate exist. Broker product choice is a revision of ADR-001 with POC evidence, not a default to Casdoor. Only after Acceptance may a production identity migration be proposed. P2's provider-neutral test migration is not that production migration, and it still waits for the P2 stage rather than this document.
