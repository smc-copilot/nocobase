# Octop Contract Probe Evidence — 2026-11-21

## Target

- Endpoint: `http://192.168.99.170:8088`
- Auth mode: `bearer_env` (admin JWT, redacted)
- Probe window: 2026-11-21T15:40Z – 2026-11-21T15:50Z (approx)

## OpenAPI availability

| Path                     | Status                        |
| ------------------------ | ----------------------------- |
| `/api/openapi.json`      | 404                           |
| `/api/docs/openapi.json` | 404                           |
| `/api/docs`              | 404                           |
| `/openapi.json`          | 200 HTML SPA shell (not JSON) |

**Conclusion:** Instance does not expose OpenAPI. Contract frozen from live response shapes and 422 validation probes. Drift detection uses frozen field allowlist + 422 monitoring, not OpenAPI fingerprint.

## Health

`GET /api/health` → 200

```json
{
  "ok": true,
  "db": true,
  "users_loaded": 2,
  "agents_running": 2
}
```

## Auth

- Bearer JWT accepted for admin role (purpose=`access`).
- `POST /api/auth/login` exists (422 when body empty: username+password required).
- Token TTL observed ~24h from JWT `exp`.

## LDAP preflight (SG-AG-004)

`GET /api/auth/ldap/config` → 200 (password fields absent)

```json
{
  "enabled": true,
  "display_name": "OA",
  "server_url": "ldap://192.168.99.9:389",
  "has_bind_password": true,
  "warnings": ["cleartext_ldap", "no_admin_groups"]
}
```

Oracle for directory mode: `enabled == true && has_bind_password == true`.

## Roles / permissions (SG-AG-005)

Roles: `admin` (system_role=admin, exclude from Agent Grants), `user` (default), `expert`.

Default `user` role policies: `max_agents=1`, `allowed_backend_types=["docker"]`.

Permission catalog keys include nav/settings/control/admin categories (see `octop_permissions.redacted.json`).

## User create schema (SG-AG-001 / SG-AG-003)

Observed from 422/400/409/201 probes:

| Field                    | Observed                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `username`               | required                                                   |
| `directory`              | boolean; string `"yes"` coerced to true on this instance   |
| `password`               | required when directory=false (else 400 PASSWORD_TOO_WEAK) |
| `role`                   | default `user`                                             |
| `permissions`            | default = user role permission set                         |
| `role_name`              | default role display name                                  |
| `max_agents`             | default from role (1 for user)                             |
| `allowed_backend_types`  | list; default `["docker"]` for user                        |
| `token_quota`            | integer or null                                            |
| `create_default_expert`  | boolean; default false                                     |
| `expert_template_source` | enum `catalog` \| `published`                              |
| `expert_template_id`     | string when creating default expert                        |

Errors:

- Duplicate username → 409 `{ "error": { "code": "USERNAME_TAKEN" } }`
- Validation → 422 `{ "detail": [...] }`
- Weak password → 400 `{ "error": { "code": "PASSWORD_TOO_WEAK" } }`

v1 UI locks `directory=true` and never sends password.

## Bootstrap (SG-AG-006)

Authorized write probe: username `nb-probe-20261121`, template `01M7SH5HEGK5VC8MR87F2T185F`.

Create response excerpt (redacted):

```json
{
  "id": 23,
  "username": "nb-probe-20261121",
  "directory": true,
  "default_expert": {
    "requested": true,
    "source": "published",
    "template_id": "01M7SH5HEGK5VC8MR87F2T185F",
    "status": "created",
    "agent_id": "8QZKMG",
    "bootstrap_status": "pending",
    "error_code": null,
    "error_message": null
  }
}
```

Agent list fields: `agent_id`, `user_id`, `owner_username`, `kind`, `state`, `bootstrap_pending`, `published_expert_id`, `last_error`.

`GET /api/agents/{agent_id}` works with string agent_id (numeric id → 404).

Observation: after ~8 minutes `bootstrap_pending` remained `true` while `state=running`. Completion is lazy/long-running.

**Oracle:** `COMPLETED` iff agent visible AND `kind=expert` AND `bootstrap_pending==false` AND `last_error==null`; else keep `BOOTSTRAP_PENDING`. Never treat timeout as failure. Never auto-delete Octop user.

## Cleanup

- Accidental user `x` (id=22) deleted (204).
- Probe user `nb-probe-20261121` (id=23) deleted (204); agents restored to admin + SMC-SZ-HR15563 only.

## Gap status

| Gap       | Status                                                         |
| --------- | -------------------------------------------------------------- |
| SG-AG-001 | CLOSED                                                         |
| SG-AG-002 | CLOSED                                                         |
| SG-AG-003 | CLOSED (directory=false password policy known; v1 UI disables) |
| SG-AG-004 | CLOSED                                                         |
| SG-AG-005 | CLOSED                                                         |
| SG-AG-006 | CLOSED (oracle defined; pending can persist)                   |
| SG-AG-007 | CLOSED                                                         |
