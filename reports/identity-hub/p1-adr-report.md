# P1 ADR and POC report

| Field             | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| Date              | 2026-11-28                                                                |
| Branch            | `feat/v3-enterprise-identity-hub`                                         |
| PRD baseline      | `e4d399b6ee`                                                              |
| HEAD when written | `95e7b0cc60` (`fix(apps): adopt Foundation v3 API without config or CLI`) |
| Stage result      | Docs only. Proposed, not Accepted. P1 has not exited.                     |

P1 wrote architecture decisions and a POC record. It did not change application or plugin source, and it did not add a migration. The ADRs are Proposed working decisions. They are not an accepted vendor selection and they do not authorize a production identity migration.

## Files created

- `docs/engineering/identity-hub/README.md` — index and status table.
- `docs/engineering/identity-hub/adr-001-center-broker-boundary.md` — Mode B hypothesis. Hub owns Person data. Broker product undecided. PRD 17.1 answered from repository evidence and the missing environment.
- `docs/engineering/identity-hub/adr-002-person-identity-model.md` — `personId`, uniqueness, employee number scope, merge, attribute lock, Broker subject.
- `docs/engineering/identity-hub/adr-003-app-membership-projection.md` — Membership versus permission sets, app-local `AppUserBinding`, message-broker outbox, replay and dead-letter gap.
- `docs/engineering/identity-hub/adr-004-identity-client.md` — future `app-plugin-enterprise-identity-client`, token checks, passwordless `internalAdapter.createUser`.
- `docs/engineering/identity-hub/poc-plan.md` — POC-01 through POC-14. No PASS.
- `docs/engineering/identity-hub/p1-exit.md` — exit checklist and the P2 boundary.
- `reports/identity-hub/p1-adr-report.md` — this file.

## POC environment

The only identity system in the POC environment is the existing Casdoor test instance. This pass did not call it, including read-only, and did not change it. Keycloak, Authentik, LDAP/Active Directory, and a second OIDC provider are unavailable. Those items are BLOCKED or NOT RUN in `poc-plan.md`.

## Decision in one paragraph

The working hypothesis is Mode B. The Enterprise Identity Hub is the proposed Person authority. Casdoor is shown in source as an app-local OIDC login and `externalIdentities` binding, and it is not shown as the enterprise Person authority, a multi-provider link, App Membership, or a lifecycle event source. Business apps should talk to the Hub and a replaceable Broker. The Broker product is undecided. P2, when it starts, is limited to a provider-neutral Hub core and the existing `@nocobase/app-plugin-message-broker` outbox, with no second outbox table and no production IAM migration while these ADRs remain Proposed.

## Not done

No git commit. No Accepted status. No live POC evidence. No Keycloak, Authentik, LDAP, or second-OIDC result.
