# Enterprise Portal Casdoor Authorization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend existing `@superice/app-plugin-enterprise-app-portal` + `@nocobase/app-plugin-casdoor-identity` so admins grant Casdoor Application access (Permission API), set default apps, and employees auto-route via `/portal` to authorized Octop/other apps.

**Architecture:** Casdoor remains the authority for users, applications, and application access. NocoBase stores only portal connection secrets (server-side), launch URL overrides / allowlist, user default-app preferences, and permission-operation audit. The Casdoor Application `admin/nocobase-portal` (already created) supplies OIDC + Management API client credentials.

**Tech Stack:** NocoBase 3 plugins (Hono routes, Better Auth genericOAuth, existing portal services), Casdoor Enterprise 4.20 Permission API.

## File map

| Area                      | Primary files                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Casdoor Management client | `packages/plugins/app-plugin-enterprise-app-portal/server/services/casdoor-management-client.ts` (new) |
| Access adapter            | `.../casdoor-application-access.ts` — implement `managementApi`                                        |
| Grant/revoke + enforce    | `.../casdoor-application-grants.ts` (new)                                                              |
| Connection config         | portal plugin config + sealed storage or app `config.yml` / env                                        |
| Routes                    | `.../routes/portal.ts` + schemas — admin users/apps/grants, route decision, open                       |
| Preferences / defaults    | `.../user-preferences.ts` (reuse)                                                                      |
| Auto-route                | app client pages under `packages/apps/app-enterprise-portal/client/pages/`                             |
| Audit                     | reuse `access-audit.ts` + permission operation rows if needed                                          |
| Tests                     | `packages/plugins/app-plugin-enterprise-app-portal/tests/server/`                                      |

## Tasks

### Task 1: Wire Portal Casdoor credentials + connection test APIs

**Files:** app `.env` (local only), `server/config` for portal/casdoorIdentity, new management client, admin routes for test-connection / list-users / list-applications.

**Done when:** PORTAL-01..03 pass against live Casdoor with `clientId`/`clientSecret` of `nocobase-portal`; secrets never returned to browser.

### Task 2: Implement Permission-based grant/revoke + access listing

**Files:** `casdoor-application-grants.ts`, extend access adapter `managementApi`, audit writes.

**Done when:** grant/revoke uses Casdoor Permission API with namespaced rules; enforce + re-read; inherited group/role grants distinguished; PORTAL-05..07 path ready for live users.

### Task 3: Admin authorization matrix UI + entry config pages

**Files:** app client settings routes/pages; portal APIs for grants matrix.

**Done when:** left Casdoor users / right apps with authorize + default; catalog page only overrides launch display (no delete Casdoor apps).

### Task 4: Employee `/portal` auto-route + my-apps

**Files:** client portal routes; `GET .../route` decision matching PRD cases A–E; open/launch re-checks Casdoor.

**Done when:** PORTAL-08..12 behavior covered by unit tests + live smoke.

### Task 5: Live acceptance + report

**Files:** acceptance markdown under `prd/` or `docs/`; unit tests green for touched packages.

**Done when:** octop + open-buddy loop with two employees documented PASS/PARTIAL/BLOCKED; no WeKnora (absent in Casdoor).

## Out of scope

AD/LDAP, Octop/WeKnora source changes, second RBAC, recreating existing Casdoor apps.
