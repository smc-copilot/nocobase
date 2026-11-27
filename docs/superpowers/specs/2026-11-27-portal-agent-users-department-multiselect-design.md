# Design: Portal Agent Users — Department multi-select filter

Date: 2026-11-27
Status: Approved
Scope: `packages/apps/app-enterprise-portal` client page `/settings/portal-agent-users`

## Goal

Change the department filter on the Agent User Management list from single-select to multi-select so operators can narrow the table to employees belonging to any of several Casdoor groups.

## Decisions

- Match mode: OR — a row is kept when `row.groups` intersects the selected department id set.
- Empty selection means all departments (no department filter), same effective default as today's「全部部门」.
- Trigger label: empty →「全部部门」/「All departments」; non-empty →「已选 N 个部门」/「N departments selected」via a locale key with `{{count}}`.
- UI approach: replace the department `Select` with `DropdownMenu` + `DropdownMenuCheckboxItem` (same pattern as `DataTableViewOptions`). No new UI package. -「全部部门」is not a checkbox item; clearing selection (empty array) is the all-departments state. The menu includes a clear action that resets to `[]`.
- Instance filter stays single-select. No API or plugin server changes.

## Model

In `portal-agent-users-model.ts`:

- `AgentGrantUserFilters.department: string` becomes `departments: readonly string[]`.
- Remove use of `AGENT_GRANT_FILTER_ALL` for the department dimension (instance filter may keep the sentinel).
- `filterAgentGrantUsers`: if `departments.length === 0`, skip department checks; otherwise require `departments.some((id) => row.groups.includes(id))`.

## UI

In `portal-agent-users.tsx`:

- State: `departmentFilter: string[]`, default `[]`.
- Trigger: outline control aligned with the existing filter bar width; `aria-label` remains the department field label.
- Menu items: one checkbox per `uniqueDepartments(users)` id, label via `formatGroupLabel`.
- Clear control: resets to `[]` when any department is selected.

## Locales

Add under `settings` in `zh-CN.ts` and `en-US.ts`:

- `portalAgentUsersDepartmentSelected` — Chinese `已选 {{count}} 个部门`, English `{{count}} departments selected`.

Keep `portalAgentUsersDepartment` and `portalAgentUsersDepartmentAll`.

## Tests

Update `tests/client/portal-agent-users.test.tsx`:

- Unit: `filterAgentGrantUsers` with `departments: []` (all), one id, and multiple ids (OR).
- Page: open department menu, toggle two departments, assert trigger shows selected count and table rows match OR semantics; clear returns to all departments.

## Out of scope

- Server-side filtering or query params for department.
- Search box inside the department menu.
- Changing row selection, sync tabs, or install/initialize flows.
