# P4 — Field / Gate B status

Date: 2026-11-13  
Hosts: Control / demo Apps (local), Casdoor (typically `:8000`), remote Docker `192.168.102.104`, PG as configured by the operator

## Honest status

| Item                                                | Status                        | Notes                                                                              |
| --------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| A–F business scenarios on remote Octop + dual demos | BLOCKED (environment)         | Needs Octop host install package at SHA `64689a5b…`. No forged run evidence.       |
| UNKNOWN / lost-receipt sequences                    | PASS (code) / PENDING (field) | Covered in adapter fault-injection tests; remote browser confirmation needs Octop. |
| SEC matrix                                          | Partial                       | Identity negatives in plugin tests; remote SEC pending.                            |
| HTTPS + iframe cookies (R37)                        | BLOCKED (environment)         | Requires TLS material and approved Origins.                                        |
| Host lifecycle / Docker (R40)                       | BLOCKED (environment)         | Remote `192.168.102.104`.                                                          |
| Backup / restore + secret rotation (R41)            | BLOCKED (environment)         | Ops checklist in `ops-handbook.md`; not executed remotely in this delivery.        |
| Live Casdoor OIDC / JWT (R04/R05/R10 B)             | BEST-EFFORT                   | See Gate A report R5 section; record claim/audience when a live run succeeds.      |

## What is ready locally

- V2.0 Gate A on `feat/v3-agent-authorization`: `@nocobase/app-plugin-agent-authorization` + adapter grant wiring; see `prd/acceptance/gate-a-v2-report.md`.
- Integration Demo registers agent-authorization before business-ui-adapter; Casdoor stays optional login only.
- Ops for local Octop + Demo: `prd/acceptance/p4/agent-authorization-ops.md`.
- Acceptance contracts under `prd/acceptance/contracts/`.

## Operator-owned inputs (not code defects)

1. Octop host install package pinned to SHA `64689a5b9863d974783f0605ed7673a7d5f73b22`.
2. Register Octop OAuth URLs against Demo `/api/agentAuthorization/oauth/*` and Adapter connection `clientId`.
3. HTTPS/TLS material for iframe Cookie acceptance.
4. Remote dual-host and backup credentials when claiming R40/R41.
5. Casdoor is optional; do not treat it as a Gate A prerequisite.
