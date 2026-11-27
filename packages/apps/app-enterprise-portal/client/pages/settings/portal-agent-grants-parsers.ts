import {
  selectableRoles,
  type AgentGrantApplication,
  type AgentGrantCreateOptions,
  type AgentGrantEmployee,
  type AgentGrantOperation,
  type InstalledExpert,
  type OctopAccountState,
  type PublishedTemplate,
} from './portal-agent-grants-model.js';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

export function firstString(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function readStringList(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function readApplications(data: unknown): AgentGrantApplication[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.appCode !== 'string') return [];
    return [
      {
        appCode: row.appCode,
        name: typeof row.name === 'string' ? row.name : row.appCode,
        appType: typeof row.appType === 'string' ? row.appType : '',
        casdoorAppKey:
          typeof row.casdoorAppKey === 'string' ? row.casdoorAppKey : '',
        agentGrantsEnabled: row.agentGrantsEnabled === true,
        apiBaseUrlConfigured:
          row.apiBaseUrlConfigured === true ||
          (typeof row.apiBaseUrl === 'string' && row.apiBaseUrl.length > 0),
        apiAuthMode:
          typeof row.apiAuthMode === 'string' ? row.apiAuthMode : null,
      },
    ];
  });
}

export function readExperts(value: unknown): InstalledExpert[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const agentId = firstString(row, 'agentId', 'agent_id');
    if (!agentId) return [];
    const published = firstString(
      row,
      'publishedExpertId',
      'published_expert_id',
    );
    return [
      {
        agentId,
        publishedExpertId: published || null,
        name: firstString(row, 'name'),
        state: firstString(row, 'state'),
        bootstrapPending:
          row.bootstrapPending === true || row.bootstrap_pending === true,
      },
    ];
  });
}

export function readEmployees(data: unknown): AgentGrantEmployee[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = firstString(row, 'casdoorUserId', 'casdoor_user_id', 'id');
    const name = firstString(row, 'username', 'name');
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        displayName:
          typeof row.displayName === 'string' && row.displayName.trim() !== ''
            ? row.displayName
            : name,
        email: typeof row.email === 'string' ? row.email : '',
        isForbidden: row.isForbidden === true,
        grantSource:
          row.grantSource === 'inherited' || row.grantSource === 'direct'
            ? row.grantSource
            : undefined,
        accountExists: row.accountExists === true,
        octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
        disabled: row.disabled === true,
        syncedAt: firstString(row, 'syncedAt', 'synced_at') || null,
        experts: readExperts(row.experts),
      },
    ];
  });
}

export function readOctopState(data: unknown): OctopAccountState | undefined {
  const body = asRecord(data);
  const row = asRecord(body?.data);
  if (!row) return undefined;
  return {
    accountExists: row.accountExists === true,
    disabled: row.disabled === true,
    octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
    experts: readExperts(row.experts),
  };
}

export function readTemplates(data: unknown): PublishedTemplate[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = firstString(row, 'id');
    if (!id) return [];
    return [
      {
        id,
        name: firstString(row, 'name') || id,
        description: firstString(row, 'description') || null,
        creatorUsername:
          firstString(row, 'creatorUsername', 'creator_username') || null,
        updatedAt: firstString(row, 'updatedAt', 'updated_at') || null,
      },
    ];
  });
}

export function readCreateOptions(data: unknown): AgentGrantCreateOptions {
  const body = asRecord(data);
  const row = asRecord(body?.data) ?? {};
  const roles = (Array.isArray(row.roles) ? row.roles : []).flatMap((item) => {
    const role = asRecord(item);
    if (!role) return [];
    const id = firstString(role, 'id', 'userRoleId', 'user_role_id');
    if (!id) return [];
    return [
      {
        id,
        name: firstString(role, 'name', 'userRoleName', 'user_role_name') || id,
        systemRole: firstString(role, 'systemRole', 'system_role') || null,
        permissions: readStringList(role, 'permissions'),
        maxAgents: readNumber(role, 'maxAgents', 'max_agents'),
        tokenQuota: readNumber(role, 'tokenQuota', 'token_quota'),
        workspaceRootDir:
          firstString(role, 'workspaceRootDir', 'workspace_root_dir') || null,
        allowedBackendTypes: readStringList(
          role,
          'allowedBackendTypes',
          'allowed_backend_types',
        ),
      },
    ];
  });
  return {
    roles: selectableRoles(roles),
    ldapConfigured: row.ldapConfigured === true,
    allowedBackendTypes: ['docker'],
    expertTemplateSource: 'published',
  };
}

export function readOperation(data: unknown): AgentGrantOperation | undefined {
  const body = asRecord(data);
  const row = asRecord(body?.data);
  if (!row || typeof row.id !== 'string') return undefined;
  return {
    id: row.id,
    status: typeof row.status === 'string' ? row.status : '',
    operationMode: firstString(row, 'operationMode', 'operation_mode') || null,
    selectedExpertCount: readNumber(row, 'selectedExpertCount') ?? 0,
    completedExpertCount: readNumber(row, 'completedExpertCount') ?? 0,
    failedExpertCount: readNumber(row, 'failedExpertCount') ?? 0,
    skippedExpertCount: readNumber(row, 'skippedExpertCount') ?? 0,
    bootstrapStatus:
      firstString(row, 'bootstrapStatus', 'bootstrap_status') || null,
    agentId: firstString(row, 'agentId', 'agent_id') || null,
    publishedExpertId:
      firstString(
        row,
        'publishedExpertId',
        'published_expert_id',
        'expertTemplateId',
      ) || null,
    octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
    errorCode: firstString(row, 'errorCode', 'error_code') || null,
    errorMessage: firstString(row, 'errorMessage', 'error_message') || null,
  };
}

export function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
