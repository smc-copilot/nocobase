# Agent Grants v1.1 Evidence — 2026-11-22

## Scope

Closes SG-AG-101 and SG-AG-102 for PRD-NOCOBASE-AGENT-GRANTS-v1.1.0 and records implementation verification for multi-expert install.

## SG-AG-101 — Target-user install API

Confirmed endpoint:

```http
POST /api/users/{user_id}/experts/published/{expert_id}/install
```

NocoBase client method: `OctopManagementClient.installExpertToUser`.

Observed contract (redacted shapes):

| Status | Meaning                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------ |
| 201    | New agent created; body includes `agent_id`, `published_expert_id`, `bootstrap_pending`, `state` |
| 200    | Already installed / idempotent; `already_installed=true` with existing `agent_id`                |
| 403    | Actor lacks permission → mapped to `OCTOP_PERMISSION_INSUFFICIENT`                               |
| 404    | User or template missing → mapped to `OCTOP_EXPERT_INSTALL_REJECTED`                             |

Request body (server-built, never from browser secrets):

```json
{
  "name": "<template or display name>",
  "description": "<template description or empty string>"
}
```

Sensitive fields (`password`, bearer token, secrets) are absent from Operation/Audit/ExpertItem persistence.

## SG-AG-102 — Existing account append

Product decision confirmed: existing Octop accounts are not recreated; Agent Grants installs only templates the user does not already own.

Server rules:

- New user: `operationMode=CREATE_USER_AND_INSTALL`, one `POST /api/users` with `create_default_expert=true` for `defaultExpertTemplateId`, then install remaining templates.
- Existing user: `operationMode=INSTALL_ONLY`, `defaultExpertTemplateId` must be null, no `POST /api/users`.
- Duplicate `(user_id, published_expert_id)` is skipped client-side (disabled checkbox), server-side (already-installed filter), and Octop-side (200 idempotent).

## Automated verification (this workspace)

| Suite                                                                                          | Result    |
| ---------------------------------------------------------------------------------------------- | --------- |
| `@superice/app-plugin-enterprise-app-portal` (migration, create orchestration, install client) | 58 passed |
| `@superice/app-enterprise-portal` `tests/client/portal-agent-grants.test.tsx`                  | 4 passed  |
| Plugin `typecheck`                                                                             | passed    |
| App `typecheck`                                                                                | passed    |

Covered flows in harness:

- New user: default expert via create + additional `installExpertToUser` calls
- Existing user: install-only path
- Partial failure / expert item status aggregation
- Permissions forced from role; `allowedBackendTypes` forced to `['docker']`
- Identity fields resolved server-side from Casdoor

## Golden Consumer note

Live Octop instance target remains `http://192.168.99.170:8088` (see `probe-2026-11-21-summary.md`). Target-user install API availability and append-allowed product behavior were confirmed before implementation. Repeat live multi-expert create/install on that instance when network access is available; keep responses under `prd/casdoor/evidence/golden/` with secrets redacted.

## Uniqueness oracle

```text
count(user_id, published_expert_id) == 1
```

Enforced by UI disable of installed templates, server skip of already-installed IDs, unique `(operationId, expertTemplateId)` on Expert Items, and Octop 200 idempotent install.
