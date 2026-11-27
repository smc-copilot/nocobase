import {
  type EmployeeSyncFilter,
  type InstalledExpert,
} from './portal-agent-grants-model.js';
import {
  asRecord,
  firstString,
  readExperts,
} from './portal-agent-grants-parsers.js';

/** Sentinel for the instance and department selects. */
export const AGENT_GRANT_FILTER_ALL = '__all__';

export interface AgentGrantUser {
  readonly id: string;
  readonly appCode: string;
  readonly appName: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  /** Casdoor group ids (`owner/name`). */
  readonly groups: readonly string[];
  readonly accountExists: boolean;
  readonly octopUserId: string | null;
  readonly disabled: boolean;
  readonly syncedAt: string | null;
  readonly experts: readonly InstalledExpert[];
}

export interface AgentGrantUserFilters {
  readonly appCode: string;
  readonly department: string;
  readonly sync: EmployeeSyncFilter;
  readonly query: string;
}

export function agentGrantUsersPath(): string {
  return 'enterpriseAppPortal/agentGrants/users';
}

/** Drop the Casdoor owner prefix so `smartcore/JP_Dept` reads as `JP_Dept`. */
export function formatGroupLabel(groupId: string): string {
  const slash = groupId.indexOf('/');
  return slash > 0 ? groupId.slice(slash + 1) : groupId;
}

export function formatDepartments(
  groups: readonly string[] | undefined,
): string {
  if (!groups || groups.length === 0) return '—';
  return groups.map(formatGroupLabel).join(', ');
}

export function agentGrantUserKey(row: {
  readonly appCode: string;
  readonly id: string;
}): string {
  return `${row.appCode}::${row.id}`;
}

export function readAgentGrantUsers(data: unknown): AgentGrantUser[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = firstString(row, 'casdoorUserId', 'casdoor_user_id', 'id');
    const name = firstString(row, 'username', 'name');
    const appCode = firstString(row, 'appCode', 'app_code');
    if (!id || !name || !appCode) return [];
    const groups = Array.isArray(row.groups)
      ? row.groups.filter((group): group is string => typeof group === 'string')
      : [];
    return [
      {
        id,
        appCode,
        appName: firstString(row, 'appName', 'app_name') || appCode,
        name,
        displayName:
          typeof row.displayName === 'string' && row.displayName.trim() !== ''
            ? row.displayName
            : name,
        email: typeof row.email === 'string' ? row.email : '',
        groups,
        accountExists: row.accountExists === true,
        octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
        disabled: row.disabled === true,
        syncedAt: firstString(row, 'syncedAt', 'synced_at') || null,
        experts: readExperts(row.experts),
      },
    ];
  });
}

/** Unique Casdoor group ids, ordered by the department label. */
export function uniqueDepartments(rows: readonly AgentGrantUser[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const group of row.groups) {
      if (group.trim() !== '') ids.add(group);
    }
  }
  return [...ids].sort((left, right) =>
    formatGroupLabel(left).localeCompare(formatGroupLabel(right), undefined, {
      sensitivity: 'base',
      numeric: true,
    }),
  );
}

export function filterAgentGrantUsers(
  rows: readonly AgentGrantUser[],
  filters: AgentGrantUserFilters,
): AgentGrantUser[] {
  const needle = filters.query.trim().toLowerCase();
  const appCode =
    filters.appCode === AGENT_GRANT_FILTER_ALL ? '' : filters.appCode;
  const department =
    filters.department === AGENT_GRANT_FILTER_ALL ? '' : filters.department;
  return rows.filter((row) => {
    if (appCode && row.appCode !== appCode) return false;
    if (department && !row.groups.includes(department)) return false;
    if (filters.sync === 'synced' && !row.accountExists) return false;
    if (filters.sync === 'unsynced' && row.accountExists) return false;
    if (!needle) return true;
    return [
      row.displayName,
      row.name,
      row.email,
      row.appName,
      row.appCode,
      formatDepartments(row.groups),
    ].some((value) => value.toLowerCase().includes(needle));
  });
}
