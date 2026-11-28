# Enterprise Identity Hub

P1 architecture records for Enterprise Identity Hub on branch `feat/v3-enterprise-identity-hub`. The PRD baseline is `e4d399b6ee`. P0 Foundation v3 compatibility is commit `95e7b0cc60`. The source requirements are sections 17 and 18.2 of `prd/NocoBase-v3.0.2-Enterprise-Identity-Hub-Implementation-PRD-v1.0.md`.

Every decision below is **Proposed**. Nothing in this directory is Accepted. Proposed text does not authorize a production identity database, a production migration, or a hard dependency from a business app on Casdoor, Keycloak, or Authentik.

This pass read the PRD and the repository. It did not call the existing Casdoor test instance. Keycloak, Authentik, LDAP/Active Directory, and a second OIDC provider are not available in the POC environment, so those checks are BLOCKED or NOT RUN. See [poc-plan.md](poc-plan.md).

## Working hypothesis

Mode B from PRD section 5.2: an Enterprise Identity Hub plus a separate Identity Broker. The Hub is the sole authority for Person master data. The Broker product is undecided. Business apps authenticate through the Broker and learn Person and App Membership facts from the Hub. They do not call a vendor user API as their system of record.

## Documents

| Document                                                                     | Status     | Scope                                                                                              |
| ---------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| [adr-001-center-broker-boundary.md](adr-001-center-broker-boundary.md)       | Proposed   | Answers PRD 17.1. Hub owns Person data. Broker product is undecided.                               |
| [adr-002-person-identity-model.md](adr-002-person-identity-model.md)         | Proposed   | Answers PRD 17.2. `personId`, identity uniqueness, merge, attribute lock, Broker subject.          |
| [adr-003-app-membership-projection.md](adr-003-app-membership-projection.md) | Proposed   | Answers PRD 17.3. Membership, local projection, message-broker outbox, disable and session revoke. |
| [adr-004-identity-client.md](adr-004-identity-client.md)                     | Proposed   | Answers PRD 17.4. Future `app-plugin-enterprise-identity-client`.                                  |
| [poc-plan.md](poc-plan.md)                                                   | Recorded   | POC-01 through POC-14. No scenario is PASS.                                                        |
| [p1-exit.md](p1-exit.md)                                                     | Not exited | Checklist against PRD 18.2 and the P2 boundary.                                                    |

## Status

| Item                          | State                             | Evidence in this pass                                                                                           |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Person master-data authority  | Proposed: Enterprise Identity Hub | ADR-001. Casdoor is not shown to be that authority.                                                             |
| Broker product                | Undecided                         | Keycloak and Authentik were not available. Casdoor OIDC login exists in plugin code and was not re-tested live. |
| Deployment shape              | Proposed: Mode B (Hub + Broker)   | Mode A stays open until a later POC proves one product covers Person, linking, Membership, events, and audit.   |
| POC-01 .. POC-14              | Not met                           | [poc-plan.md](poc-plan.md). Statuses are NOT RUN, BLOCKED, or N/A.                                              |
| Production IAM migration      | Not started                       | Required until an ADR is Accepted.                                                                              |
| P2 scope implied by this pack | Provider-neutral Hub core only    | [p1-exit.md](p1-exit.md).                                                                                       |

## How to read a Proposed ADR

A Proposed ADR is the hypothesis P2 is allowed to encode in provider-neutral tables and services. It is not a vendor selection, a production runbook, or permission to import Portal or Meeting users. Acceptance needs a reviewer decision plus the missing POC evidence named in [p1-exit.md](p1-exit.md). Replacing a Proposed choice is a new ADR or a revision of that ADR before any migration that assumes the choice is merged.
