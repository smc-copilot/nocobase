# Portal Agent Users Department Multi-select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the department filter on `/settings/portal-agent-users` multi-select with OR matching.

**Architecture:** Keep filtering client-side. Change `AgentGrantUserFilters.departments` to `readonly string[]` (`[]` = all). Replace the department `Select` with `DropdownMenu` + `DropdownMenuCheckboxItem`. Trigger shows all-departments copy or selected count.

**Tech Stack:** React, existing shadcn DropdownMenu, Vitest + Testing Library, i18n locales.

**Spec:** `docs/superpowers/specs/2026-11-27-portal-agent-users-department-multiselect-design.md`

## Global Constraints

- OR match only; empty selection = all departments.
- No API / plugin / migration changes.
- Instance filter remains single-select.
- Follow existing Portal settings UI patterns; no new UI packages.

---

### Task 1: Model filter + unit tests

**Files:**

- Modify: `packages/apps/app-enterprise-portal/client/pages/settings/portal-agent-users-model.ts`
- Modify: `packages/apps/app-enterprise-portal/tests/client/portal-agent-users.test.tsx`

- [ ] **Step 1:** Update unit tests to use `departments: [] | string[]` and cover OR multi-select.
- [ ] **Step 2:** Run the filter describe; confirm RED.
- [ ] **Step 3:** Change `AgentGrantUserFilters` and `filterAgentGrantUsers` to the array API.
- [ ] **Step 4:** Re-run unit tests; confirm GREEN.
- [ ] **Step 5:** Commit.

### Task 2: Locales + page UI + page tests

**Files:**

- Modify: `packages/apps/app-enterprise-portal/client/locales/en-US.ts`
- Modify: `packages/apps/app-enterprise-portal/client/locales/zh-CN.ts`
- Modify: `packages/apps/app-enterprise-portal/client/pages/settings/portal-agent-users.tsx`
- Modify: `packages/apps/app-enterprise-portal/tests/client/portal-agent-users.test.tsx`

- [ ] **Step 1:** Add `portalAgentUsersDepartmentSelected` and `portalAgentUsersDepartmentClear` locale keys.
- [ ] **Step 2:** Update page test department interactions for menuitemcheckbox + clear.
- [ ] **Step 3:** Run page test; confirm RED.
- [ ] **Step 4:** Wire DropdownMenu multi-select UI and `departments` state.
- [ ] **Step 5:** Run `portal-agent-users` tests; confirm GREEN.
- [ ] **Step 6:** Commit.
