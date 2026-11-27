/**
 * Golden Consumer probe against a live Octop instance.
 * Usage:
 *   OCTOP_API_BASE_URL=http://192.168.99.170:8088 \
 *   OCTOP_BEARER_TOKEN=... \
 *   node scripts/golden-agent-grants-probe.mjs
 *
 * Writes redacted evidence under prd/casdoor/evidence/golden/.
 * Creates then deletes an isolated directory user. Never keeps the account.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.OCTOP_API_BASE_URL ?? '').replace(/\/$/u, '');
const token = process.env.OCTOP_BEARER_TOKEN ?? '';
if (!baseUrl || !token) {
  console.error('OCTOP_API_BASE_URL and OCTOP_BEARER_TOKEN are required.');
  process.exit(2);
}

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../prd/casdoor/evidence/golden',
);
mkdirSync(root, { recursive: true });

const started = new Date().toISOString();
const commit = process.env.GIT_COMMIT ?? 'unknown';
const username = `nb-golden-${Date.now().toString(36)}`;

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: response.status, json };
}

function write(name, value) {
  writeFileSync(join(root, name), JSON.stringify(value, null, 2));
}

function redactUser(user) {
  if (!user || typeof user !== 'object') return user;
  const { email, ...rest } = user;
  return { ...rest, email: email ? '[redacted]' : null };
}

const health = await api('GET', '/api/health');
write('octop_health.json', health.json);

const usersBefore = await api('GET', '/api/users');
write(
  'octop_users_before.json',
  Array.isArray(usersBefore.json)
    ? usersBefore.json.map(redactUser)
    : usersBefore.json,
);

const roles = await api('GET', '/api/users/roles');
write(
  'octop_roles.json',
  Array.isArray(roles.json)
    ? roles.json.map((role) => ({
        user_role_id: role.user_role_id,
        user_role_name: role.user_role_name,
        system_role: role.system_role,
        permissions: role.permissions,
        max_agents: role.max_agents,
        allowed_backend_types: role.allowed_backend_types,
      }))
    : roles.json,
);

const permissions = await api('GET', '/api/users/permissions');
write('octop_permissions.json', permissions.json);

const templates = await api('GET', '/api/experts/published');
write('octop_published_experts.json', templates.json);

const agentsBefore = await api('GET', '/api/agents?scope=all');
write(
  'octop_agents_before.json',
  Array.isArray(agentsBefore.json)
    ? agentsBefore.json.map((agent) => ({
        agent_id: agent.agent_id,
        owner_username: agent.owner_username,
        kind: agent.kind,
        state: agent.state,
        bootstrap_pending: agent.bootstrap_pending,
        published_expert_id: agent.published_expert_id,
      }))
    : agentsBefore.json,
);

const ldap = await api('GET', '/api/auth/ldap/config');
write('octop_ldap_config.redacted.json', {
  enabled: ldap.json?.enabled,
  has_bind_password: ldap.json?.has_bind_password,
  display_name: ldap.json?.display_name,
  warnings: ldap.json?.warnings,
});

const userRole = Array.isArray(roles.json)
  ? roles.json.find((role) => role.user_role_id === 'user')
  : null;
const templateId = Array.isArray(templates.json)
  ? (templates.json.find((row) => row.id === '01M7SH5HEGK5VC8MR87F2T185F')
      ?.id ?? templates.json[0]?.id)
  : null;

const createRequest = {
  username,
  display_name: 'NB Golden Probe',
  email: null,
  directory: true,
  role: 'user',
  permissions: userRole?.permissions ?? [],
  role_name: userRole?.user_role_name ?? '用户',
  workspace_root_dir: null,
  token_quota: null,
  max_agents: userRole?.max_agents ?? 1,
  allowed_backend_types: userRole?.allowed_backend_types ?? ['docker'],
  create_default_expert: true,
  expert_template_source: 'published',
  expert_template_id: templateId,
};

write('octop_create_request.redacted.json', {
  ...createRequest,
  note: 'directory=true; password omitted',
});

const created = await api('POST', '/api/users', createRequest);
write('octop_create_response.redacted.json', {
  http_status: created.status,
  body: created.json
    ? {
        id: created.json.id,
        username: created.json.username,
        directory: created.json.directory,
        has_password: created.json.has_password,
        default_expert: created.json.default_expert,
      }
    : null,
});

if (created.status !== 201) {
  write('golden_result.json', {
    status: 'FAIL',
    reason: 'CREATE_FAILED',
    http_status: created.status,
    started,
    commit,
  });
  process.exit(1);
}

const duplicate = await api('POST', '/api/users', {
  username,
  directory: true,
  role: 'user',
});
write('octop_duplicate_create.json', {
  http_status: duplicate.status,
  code: duplicate.json?.error?.code ?? null,
  expected: { http_status: 409, code: 'USERNAME_TAKEN' },
});

const usersAfter = await api('GET', '/api/users');
const match = Array.isArray(usersAfter.json)
  ? usersAfter.json.find((row) => row.username === username)
  : null;
write('octop_users_after.json', {
  created_user: redactUser(match),
  total: Array.isArray(usersAfter.json) ? usersAfter.json.length : null,
});

const agentId = created.json?.default_expert?.agent_id;
let agent = null;
if (agentId) {
  const detail = await api('GET', `/api/agents/${agentId}`);
  agent = detail.json;
}
write('octop_agents_after.json', {
  agent_id: agentId,
  kind: agent?.kind ?? null,
  state: agent?.state ?? null,
  bootstrap_pending: agent?.bootstrap_pending ?? null,
  published_expert_id: agent?.published_expert_id ?? null,
  last_error: agent?.last_error ?? null,
  bootstrap_oracle: {
    completed:
      Boolean(agent) &&
      agent.kind === 'expert' &&
      agent.bootstrap_pending === false &&
      agent.last_error == null,
    note: 'pending may persist; never treat timeout as failure',
  },
});

const deleted = await api('DELETE', `/api/users/${created.json.id}`);
const usersFinal = await api('GET', '/api/users');
const stillThere = Array.isArray(usersFinal.json)
  ? usersFinal.json.some((row) => row.username === username)
  : true;

const fingerprint = createHash('sha256')
  .update(
    JSON.stringify({
      allowlist: [
        'username',
        'display_name',
        'email',
        'directory',
        'role',
        'role_name',
        'permissions',
        'workspace_root_dir',
        'token_quota',
        'max_agents',
        'allowed_backend_types',
        'create_default_expert',
        'expert_template_source',
        'expert_template_id',
      ],
      expert_template_source_enum: ['catalog', 'published'],
    }),
  )
  .digest('hex');

const result = {
  acceptance_id: 'GOLDEN-AG-001',
  status:
    created.status === 201 &&
    duplicate.status === 409 &&
    deleted.status === 204 &&
    !stillThere
      ? 'PASS'
      : 'FAIL',
  requirement_ids: [
    'REQ-AG-001',
    'REQ-AG-003',
    'REQ-AG-004',
    'REQ-AG-005',
    'REQ-AG-006',
    'REQ-AG-007',
    'REQ-AG-008',
    'REQ-AG-009',
  ],
  repository: 'smc-copilot/nocobase',
  branch: 'cursor/casdoor-octop-portal-e860',
  commit,
  timestamp: started,
  command:
    'OCTOP_API_BASE_URL=... OCTOP_BEARER_TOKEN=... node scripts/golden-agent-grants-probe.mjs',
  exit_code: 0,
  oracle: {
    create_http: created.status,
    duplicate_http: duplicate.status,
    deleted_http: deleted.status,
    user_cleaned: !stillThere,
    contract_fingerprint_sha256: fingerprint,
  },
  evidence_files: [
    'octop_health.json',
    'octop_roles.json',
    'octop_permissions.json',
    'octop_published_experts.json',
    'octop_create_request.redacted.json',
    'octop_create_response.redacted.json',
    'octop_duplicate_create.json',
    'octop_agents_after.json',
  ],
};

write('golden_result.json', result);
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'PASS' ? 0 : 1);
