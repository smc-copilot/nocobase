/**
 * Frozen Octop `POST /api/users` allowlist from the 2026-11-21 probe.
 * Unknown keys are dropped. Confirm password is never copied.
 * Password is only kept when directory=false.
 */
export const OCTOP_CREATE_FIELD_ALLOWLIST = [
  'username',
  'display_name',
  'email',
  'directory',
  'password',
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
] as const;

export interface OctopCreateBodyInput {
  readonly username: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly directory: boolean;
  readonly password?: string | null;
  readonly role: string;
  readonly roleName: string;
  readonly permissions: readonly string[];
  readonly workspaceRootDir: string | null;
  readonly tokenQuota: number | null;
  readonly maxAgents: number | null;
  readonly allowedBackendTypes: readonly string[];
  readonly createDefaultExpert: boolean;
  readonly expertTemplateId: string | null;
}

/** Trim and lowercase Octop username / email before create or display. */
export function normalizeOctopIdentityField(
  value: string | null | undefined,
): string {
  return (value ?? '').trim().toLowerCase();
}

export function buildOctopUserCreateBody(
  input: OctopCreateBodyInput,
): Record<string, unknown> {
  const username = normalizeOctopIdentityField(input.username);
  const email = normalizeOctopIdentityField(input.email);
  const body: Record<string, unknown> = {
    username,
    display_name: input.displayName,
    email: email === '' ? null : email,
    directory: input.directory,
    role: input.role,
    role_name: input.roleName,
    permissions: [...input.permissions],
    workspace_root_dir: input.workspaceRootDir,
    token_quota: input.tokenQuota,
    max_agents: input.maxAgents,
    allowed_backend_types: [...input.allowedBackendTypes],
    create_default_expert: input.createDefaultExpert,
    expert_template_source: 'published',
  };
  if (!input.directory && input.password) {
    body.password = input.password;
  }
  if (input.createDefaultExpert) {
    body.expert_template_id = input.expertTemplateId;
  }
  return allowlistOctopCreateFields(body);
}

/**
 * Copies only frozen create fields. `expert_template_source` is forced to
 * published. Confirm password and other unknown keys are omitted. Password is
 * dropped when directory is true.
 */
export function allowlistOctopCreateFields(
  raw: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of OCTOP_CREATE_FIELD_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = raw[key];
    }
  }
  const directory = result.directory === true;
  result.directory = directory;
  result.expert_template_source = 'published';
  if (result.create_default_expert === false) {
    delete result.expert_template_id;
  }
  if (directory) {
    delete result.password;
  }
  return result;
}
