import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sanitizeCreateOptionsSnapshot } from '../../server/services/agent-grant-operations.js';
import { octopUsernameKey } from '../../server/services/agent-grants-read.js';
import {
  allowlistOctopCreateFields,
  buildOctopUserCreateBody,
  normalizeOctopIdentityField,
} from '../../server/services/octop-create-request.js';
import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

const TEMPLATE = '01M7SH5HEGK5VC8MR87F2T185F';
const TEMPLATE_B = '01M80M25NH1DPMCJ0FDJKDVGJA';

interface OctopUserRow {
  id: number;
  username: string;
  disabled?: boolean;
  max_agents?: number | null;
}

const octopState: {
  posts: number;
  installs: number;
  octopCalls: number;
  lastBody: Record<string, unknown> | undefined;
  lastInstallPath: string | undefined;
  lastInstallAsUser: string | undefined;
  lastInstallQuery: string | undefined;
  lastInstallBody: Record<string, unknown> | undefined;
  installed: {
    userId: string;
    templateId: string;
    agentId: string;
  }[];
  users: OctopUserRow[];
  onPost: (() => void) | undefined;
  onInstall: (() => void) | undefined;
  postGate: Promise<void>;
  installForbidden: boolean;
} = {
  posts: 0,
  installs: 0,
  octopCalls: 0,
  lastBody: undefined,
  lastInstallPath: undefined,
  lastInstallAsUser: undefined,
  lastInstallQuery: undefined,
  lastInstallBody: undefined,
  installed: [],
  users: [],
  onPost: undefined,
  onInstall: undefined,
  postGate: Promise.resolve(),
  installForbidden: false,
};

describe('octop username key', () => {
  it('folds NFKC, trim, and case, including eszett', () => {
    expect(octopUsernameKey('  Ａlice  ')).toBe('alice');
    expect(octopUsernameKey('ALICE')).toBe(octopUsernameKey('alice'));
    expect(octopUsernameKey('Straße')).toBe('strasse');
    expect(octopUsernameKey('\u0130')).toBe('i\u0307');
  });
});

describe('octop create identity normalization', () => {
  it('trims and lowercases username and email in the create body', () => {
    expect(normalizeOctopIdentityField('  SMC-SZ-HR26057  ')).toBe(
      'smc-sz-hr26057',
    );
    const body = buildOctopUserCreateBody({
      username: ' SMC-SZ-HR26057 ',
      displayName: '倪恒芝',
      email: ' Gigi.ni@smartcore-cloud.com ',
      directory: true,
      role: 'user',
      roleName: 'User',
      permissions: ['experts'],
      workspaceRootDir: null,
      tokenQuota: null,
      maxAgents: 1,
      allowedBackendTypes: ['docker'],
      createDefaultExpert: true,
      expertTemplateId: TEMPLATE,
    });
    expect(body.username).toBe('smc-sz-hr26057');
    expect(body.email).toBe('gigi.ni@smartcore-cloud.com');
    expect(body.display_name).toBe('倪恒芝');
  });
});

describe('agent grant create', () => {
  let harness: PortalHarness;
  const env: Record<string, string | undefined> = {
    CASDOOR_CLIENT_ID: 'portal-client',
    CASDOOR_CLIENT_SECRET: 'portal-secret',
    OCTOP_ADMIN_TOKEN: 'octop-test-token',
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    if (url.hostname === 'casdoor.test') return casdoor(url, init);
    if (url.hostname === 'octop.example.com') return octop(url, init);
    return new Response('ok', { status: 200 });
  };

  beforeAll(async () => {
    harness = await createPortalHarness(
      {
        launchHostAllowlist: ['example.com'],
        octopApiHostAllowlist: ['octop.example.com'],
        access: {
          source: 'managementApi',
          managementApi: {
            endpoint: 'https://casdoor.test',
            organization: 'smartcore',
          },
        },
      },
      { env, fetchImpl },
    );
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    octopState.posts = 0;
    octopState.installs = 0;
    octopState.octopCalls = 0;
    octopState.lastBody = undefined;
    octopState.lastInstallPath = undefined;
    octopState.lastInstallAsUser = undefined;
    octopState.lastInstallQuery = undefined;
    octopState.lastInstallBody = undefined;
    octopState.installed = [];
    octopState.users = [];
    octopState.onPost = undefined;
    octopState.onInstall = undefined;
    octopState.postGate = Promise.resolve();
    octopState.installForbidden = false;
    const { query } = harness.database.connection();
    await query
      .deleteFrom('enterprisePortalAgentGrantExpertItems')
      .allowAllRows()
      .execute();
    await query
      .deleteFrom('enterprisePortalAgentGrantOperations')
      .allowAllRows()
      .execute();
    await query
      .deleteFrom('enterprisePortalAuditEvents')
      .allowAllRows()
      .execute();
    await query
      .deleteFrom('enterprisePortalApplications')
      .allowAllRows()
      .execute();
    await harness.services.catalog.create(
      {
        appCode: 'octop',
        name: 'Octop',
        appType: 'octop',
        baseUrl: 'https://example.com/apps/octop',
        casdoorAppKey: 'octop',
        agentGrantsEnabled: true,
        supportsInstallAsUser: true,
        apiBaseUrl: 'https://octop.example.com',
        apiAuthMode: 'bearer_env',
        apiTokenEnv: 'OCTOP_ADMIN_TOKEN',
      },
      'admin-1',
    );
  });

  it('installs for an existing account without POST /api/users and passes as_user', async () => {
    octopState.users = [{ id: 9, username: 'alice', max_agents: 2 }];
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE_B],
        defaultExpertTemplateId: null,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(1);
    expect(octopState.lastInstallPath).toBe(
      `/api/experts/published/${TEMPLATE_B}/install`,
    );
    expect(octopState.lastInstallAsUser).toBe('9');
    expect(created.operationMode).toBe('INSTALL_ONLY');
    expect(created.status).toBe('COMPLETED');
  });

  it('skips already-installed templates for an existing account', async () => {
    octopState.users = [{ id: 9, username: 'alice', max_agents: 5 }];
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE, TEMPLATE_B],
        defaultExpertTemplateId: null,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(1);
    expect(octopState.lastInstallAsUser).toBe('9');
    const items = await harness.services.agentGrants.listExpertItems(
      created.id,
    );
    expect(
      items.find((item) => item.expertTemplateId === TEMPLATE)?.status,
    ).toBe('ALREADY_INSTALLED');
    expect(
      items.find((item) => item.expertTemplateId === TEMPLATE_B)?.status,
    ).toBe('COMPLETED');
  });

  it('records FAILED when Octop returns 403 for an expert install', async () => {
    octopState.users = [{ id: 9, username: 'alice', max_agents: 5 }];
    octopState.installForbidden = true;
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE_B],
        defaultExpertTemplateId: null,
      },
      'admin-1',
    );
    expect(created.status).toBe('EXPERT_INSTALL_FAILED');
    const items = await harness.services.agentGrants.listExpertItems(
      created.id,
    );
    expect(items[0]?.status).toBe('FAILED');
    expect(items[0]?.errorCode).toBe('OCTOP_PERMISSION_INSUFFICIENT');
  });

  it('appends using the Octop account max_agents, not request body maxAgents', async () => {
    // Account already has TEMPLATE (see /api/agents mock). Quota on the user is 2;
    // a stale role-default maxAgents=1 in the body must not block the second install.
    octopState.users = [{ id: 9, username: 'alice', max_agents: 2 }];
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE_B],
        defaultExpertTemplateId: null,
        maxAgents: 1,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(1);
    expect(created.status).toBe('COMPLETED');
  });

  it('blocks append when the Octop account max_agents is already full', async () => {
    octopState.users = [{ id: 9, username: 'alice', max_agents: 1 }];
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE_B],
          defaultExpertTemplateId: null,
          maxAgents: 99,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_MAX_AGENTS_EXCEEDED' });
    expect(octopState.installs).toBe(0);
  });

  it('blocks create when selected experts exceed the create max_agents', async () => {
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE, TEMPLATE_B],
          defaultExpertTemplateId: TEMPLATE,
          maxAgents: 1,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_MAX_AGENTS_EXCEEDED' });
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(0);
  });

  it('blocks a disabled existing account', async () => {
    octopState.users = [{ id: 9, username: 'Alice', disabled: true }];
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: null,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_ACCOUNT_DISABLED' });
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(0);
  });

  it('does not call Octop when Casdoor does not allow the employee', async () => {
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/bob',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'CASDOOR_USER_NOT_AUTHORIZED' });
    expect(octopState.posts).toBe(0);
    expect(octopState.octopCalls).toBe(0);
  });

  it('holds one lock so a second create does not POST', async () => {
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    octopState.postGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    octopState.onPost = entered;
    const first = harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE],
        defaultExpertTemplateId: TEMPLATE,
      },
      'admin-1',
    );
    await enteredPromise;
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'AGENT_GRANT_OPERATION_IN_PROGRESS' });
    expect(octopState.posts).toBe(1);
    release();
    const created = await first;
    expect(['BOOTSTRAP_PENDING', 'COMPLETED']).toContain(created.status);
    expect(octopState.posts).toBe(1);
  });

  it('creates a new user without a default expert and without installing experts', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [],
        defaultExpertTemplateId: null,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(1);
    expect(octopState.installs).toBe(0);
    expect(octopState.lastBody).toMatchObject({
      create_default_expert: false,
    });
    expect(octopState.lastBody).not.toHaveProperty('expert_template_id');
    expect(created.selectedExpertCount).toBe(0);
    expect(created.status).toBe('COMPLETED');
  });

  it('sends directory=true, create_default_expert=false, and never a password for new users', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE],
        defaultExpertTemplateId: null,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(1);
    expect(octopState.lastBody).toMatchObject({
      username: 'alice',
      directory: true,
      expert_template_source: 'published',
      create_default_expert: false,
      allowed_backend_types: ['docker'],
      permissions: ['experts'],
    });
    expect(octopState.lastBody).not.toHaveProperty('password');
    expect(octopState.lastBody).not.toHaveProperty('expert_template_id');
    expect(octopState.lastBody).not.toHaveProperty('expertTemplateIds');
    expect(JSON.stringify(created.createOptionsSnapshot)).not.toMatch(
      /password|octop-test-token|portal-secret/i,
    );
    expect(created.createOptionsSnapshot).toMatchObject({ directory: true });
  });

  it('creates the user once then installs every selected expert with as_user', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE, TEMPLATE_B],
        defaultExpertTemplateId: TEMPLATE,
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(1);
    expect(octopState.installs).toBe(2);
    expect(octopState.lastInstallPath).toBe(
      `/api/experts/published/${TEMPLATE_B}/install`,
    );
    expect(octopState.lastInstallAsUser).toBe('23');
    expect(octopState.lastInstallQuery).toContain('as_user=23');
    expect(octopState.lastInstallBody).toMatchObject({
      name: 'Ops',
      backend: {
        type: 'named',
        name: 'sandbox',
      },
    });
    expect(created.selectedExpertCount).toBe(2);
    const items = await harness.services.agentGrants.listExpertItems(
      created.id,
    );
    expect(items).toHaveLength(2);
    expect(
      items.find((item) => item.expertTemplateId === TEMPLATE)?.agentId,
    ).toBe('8QZKMG');
    expect(
      items.find((item) => item.expertTemplateId === TEMPLATE_B)?.agentId,
    ).toBe('4HJVNM');
  });

  it('recreates the employee after Octop deletes the account that still holds the grant lock', async () => {
    const stale = await harness.services.agentGrantOps.acquire({
      appCode: 'octop',
      casdoorUserId: 'smartcore/alice',
      username: 'alice',
      actorUserId: 'admin-1',
      createOptionsSnapshot: {},
    });
    await harness.services.agentGrantOps.transition(stale.id, {
      status: 'BOOTSTRAP_PENDING',
      operationMode: 'CREATE_USER_AND_INSTALL',
      octopUserId: '9',
    });
    octopState.users = [];

    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateIds: [TEMPLATE],
        defaultExpertTemplateId: TEMPLATE,
      },
      'admin-1',
    );

    expect(octopState.posts).toBe(1);
    expect(created.id).not.toBe(stale.id);
    const closed = await harness.services.agentGrantOps.requireById(stale.id);
    expect(closed.status).toBe('BOOTSTRAP_FAILED');
    expect(closed.lockKey).toBeNull();
    expect(closed.errorCode).toBe('OCTOP_ACCOUNT_REMOVED');
  });

  it('keeps the lock when the Octop account from the open operation still exists', async () => {
    const stale = await harness.services.agentGrantOps.acquire({
      appCode: 'octop',
      casdoorUserId: 'smartcore/alice',
      username: 'alice',
      actorUserId: 'admin-1',
      createOptionsSnapshot: {},
    });
    await harness.services.agentGrantOps.transition(stale.id, {
      status: 'BOOTSTRAP_PENDING',
      octopUserId: '9',
    });
    octopState.users = [{ id: 9, username: 'alice', max_agents: 5 }];

    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE_B],
          defaultExpertTemplateId: null,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'AGENT_GRANT_OPERATION_IN_PROGRESS' });
    expect(octopState.posts).toBe(0);
    const held = await harness.services.agentGrantOps.requireById(stale.id);
    expect(held.status).toBe('BOOTSTRAP_PENDING');
    expect(held.lockKey).toBe('octop:smartcore/alice');
  });

  it('blocks expert install when supportsInstallAsUser is false', async () => {
    await harness.services.catalog.update(
      'octop',
      { supportsInstallAsUser: false },
      'admin-1',
    );
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_AS_USER_NOT_SUPPORTED' });
    expect(octopState.posts).toBe(0);
    expect(octopState.installs).toBe(0);
  });

  it('keeps a timed-out create as outcome unknown and does not POST again', async () => {
    octopState.onPost = () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN' });
    octopState.onPost = undefined;
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'AGENT_GRANT_OPERATION_IN_PROGRESS' });
    expect(octopState.posts).toBe(1);
  });

  it('blocks an administrator role before POST', async () => {
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          role: 'admin',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_CREATE_OPTIONS_INVALID' });
    expect(octopState.posts).toBe(0);
  });

  it('rejects an API URL that is only on the launch allowlist', async () => {
    await expect(
      harness.services.catalog.create(
        {
          appCode: 'octop-api',
          name: 'Other',
          appType: 'octop',
          baseUrl: 'https://example.com/apps/octop',
          casdoorAppKey: 'octop',
          agentGrantsEnabled: true,
          apiBaseUrl: 'https://example.com',
          apiAuthMode: 'bearer_env',
          apiTokenEnv: 'OCTOP_ADMIN_TOKEN',
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_API_URL_NOT_ALLOWED' });
  });

  it('lists enforced employees and omits admin roles', async () => {
    octopState.users = [
      { id: 9, username: 'alice', created_at: 1_795_158_943 },
    ];
    const employees =
      await harness.services.agentGrantsRead.listAuthorizedEmployees('octop');
    expect(employees.map((entry) => entry.username).sort()).toEqual([
      'Alice',
      'alice',
      'dave',
    ]);
    const alice = employees.find((entry) => entry.username === 'alice');
    expect(alice).toMatchObject({
      accountExists: true,
      octopUserId: '9',
      syncedAt: new Date(1_795_158_943 * 1000).toISOString(),
    });
    expect(employees.find((entry) => entry.username === 'dave')).toMatchObject({
      accountExists: false,
      syncedAt: null,
    });
    const options =
      await harness.services.agentGrantsRead.listCreateOptions('octop');
    expect(options.roles.map((role) => role.id)).toEqual(['user']);
    expect(options.allowedBackendTypes).toEqual(['docker']);
    expect(options.ldapConfigured).toBe(true);
    expect(options).not.toHaveProperty('permissions');
    const state = await harness.services.agentGrantsRead.getEmployeeOctopState(
      'octop',
      'smartcore/alice',
    );
    expect(state.experts.map((expert) => expert.agentId)).toEqual(['8QZKMG']);
    expect(state.experts.every((expert) => expert.kind === 'expert')).toBe(
      true,
    );
  });

  it('submits username and email trimmed and lowercased', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/Alice',
        expertTemplateIds: [TEMPLATE],
        defaultExpertTemplateId: TEMPLATE,
      },
      'admin-1',
    );
    expect(octopState.lastBody?.username).toBe('alice');
    expect(String(octopState.lastBody?.email ?? '').toLowerCase()).toBe(
      String(octopState.lastBody?.email ?? ''),
    );
    expect(created.username).toBe('alice');
  });

  it('reconciles a timed-out create without another POST', async () => {
    octopState.onPost = () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        {
          casdoorUserId: 'smartcore/alice',
          expertTemplateIds: [TEMPLATE],
          defaultExpertTemplateId: TEMPLATE,
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN' });
    const rows = await harness.database
      .connection()
      .query.selectFrom('enterprisePortalAgentGrantOperations')
      .selectAll()
      .execute();
    octopState.onPost = undefined;
    const reconciled = await harness.services.agentGrants.reconcile(
      String(rows[0]?.id),
      'admin-1',
    );
    expect(reconciled.status).toBe('SAFE_TO_RETRY');
    expect(octopState.posts).toBe(1);
  });

  it('strips unknown create fields and secrets from the snapshot', () => {
    const body = allowlistOctopCreateFields({
      username: 'alice',
      password: 'local-secret',
      evil: true,
      directory: true,
      token_quota: 3,
      expert_template_source: 'catalog',
    });
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('evil');
    expect(body.directory).toBe(true);
    expect(body.expert_template_source).toBe('published');
    expect(body.token_quota).toBe(3);
    const local = allowlistOctopCreateFields({
      username: 'alice',
      password: 'local-secret',
      directory: false,
    });
    expect(local.directory).toBe(false);
    expect(local.password).toBe('local-secret');
    expect(
      sanitizeCreateOptionsSnapshot({
        role: 'user',
        password: 'local-secret',
        token: 'abc',
        token_quota: 3,
        nested: { client_secret: 'hide', name: 'ok' },
      }),
    ).toEqual({
      role: 'user',
      token_quota: 3,
      nested: { name: 'ok' },
    });
  });
});

function casdoor(url: URL, init: RequestInit | undefined): Response {
  if (url.searchParams.get('clientSecret') !== 'portal-secret') {
    return Response.json({ status: 'error', msg: 'unauthorized' });
  }
  if (url.pathname === '/api/get-users') {
    const users = [
      casdoorUser('alice', 'Alice'),
      casdoorUser('Alice', 'Alice Person'),
      casdoorUser('bob', 'Bob'),
      casdoorUser('dave', 'Dave'),
      { ...casdoorUser('erin', 'Erin'), isForbidden: true },
    ];
    const value = url.searchParams.get('value');
    const data = value
      ? users.filter((entry) => entry.name.includes(value))
      : users;
    return Response.json({ status: 'ok', data, data2: data.length });
  }
  if (url.pathname === '/api/get-permissions') {
    return Response.json({
      status: 'ok',
      data: [
        {
          owner: 'smartcore',
          name: 'nocobase-portal-app-octop',
          displayName: 'Octop',
          users: ['smartcore/alice'],
          groups: [],
          roles: [],
          resources: ['octop'],
          actions: ['Read'],
          resourceType: 'Application',
          effect: 'Allow',
          state: 'Active',
          isEnabled: true,
        },
      ],
    });
  }
  if (url.pathname === '/api/enforce') {
    const subject = JSON.parse(String(init?.body ?? '[]')) as string[];
    const denied =
      subject[0] === 'smartcore/bob' || subject[0] === 'smartcore/erin';
    return Response.json({ status: 'ok', data: !denied });
  }
  return Response.json({ status: 'ok', data: [] });
}

function casdoorUser(name: string, displayName: string) {
  return {
    id: `smartcore/${name}`,
    owner: 'smartcore',
    name,
    displayName,
    email: `${name}@example.com`,
    isForbidden: false,
    isDeleted: false,
  };
}

async function octop(
  url: URL,
  init: RequestInit | undefined,
): Promise<Response> {
  octopState.octopCalls += 1;
  const header = new Headers(init?.headers).get('authorization');
  if (header !== 'Bearer octop-test-token') {
    return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  if (url.pathname === '/api/users' && init?.method === 'POST') {
    octopState.posts += 1;
    octopState.lastBody = JSON.parse(String(init.body)) as Record<
      string,
      unknown
    >;
    octopState.onPost?.();
    await octopState.postGate;
    return Response.json(
      {
        id: 23,
        username: 'alice',
        directory: true,
        default_expert: null,
      },
      { status: 201 },
    );
  }
  if (
    init?.method === 'POST' &&
    /\/api\/experts\/published\/[^/]+\/install$/u.test(url.pathname)
  ) {
    octopState.installs += 1;
    octopState.lastInstallPath = url.pathname;
    octopState.lastInstallQuery = url.search;
    octopState.lastInstallAsUser = url.searchParams.get('as_user') ?? undefined;
    octopState.lastInstallBody = JSON.parse(String(init?.body)) as Record<
      string,
      unknown
    >;
    octopState.onInstall?.();
    if (octopState.installForbidden) {
      return Response.json(
        { error: { code: 'FORBIDDEN', message: 'forbidden' } },
        { status: 403 },
      );
    }
    if (!url.searchParams.get('as_user')) {
      return Response.json(
        { error: { code: 'MISSING_AS_USER', message: 'as_user required' } },
        { status: 400 },
      );
    }
    const expertId = url.pathname.split('/').at(-2) ?? TEMPLATE_B;
    const agentId = expertId === TEMPLATE ? '8QZKMG' : '4HJVNM';
    const userId = url.searchParams.get('as_user')!;
    octopState.installed.push({ userId, templateId: expertId, agentId });
    return Response.json(
      {
        agent_id: agentId,
        user_id: Number(userId),
        name: 'Installed',
        description: '',
        state: 'running',
        published_expert_id: expertId,
        bootstrap_pending: false,
        already_installed: false,
      },
      { status: 201 },
    );
  }
  if (url.pathname === '/api/users') {
    return Response.json(octopState.users);
  }
  if (url.pathname === '/api/users/roles') {
    return Response.json([
      {
        user_role_id: 'admin',
        user_role_name: 'Admin',
        system_role: 'admin',
        permissions: ['experts'],
        policies: { max_agents: null, allowed_backend_types: ['docker'] },
      },
      {
        user_role_id: 'user',
        user_role_name: '用户',
        system_role: 'user',
        permissions: ['experts'],
        policies: {
          max_agents: 5,
          token_quota: null,
          workspace_root_dir: null,
          allowed_backend_types: ['docker'],
        },
      },
    ]);
  }
  if (url.pathname === '/api/users/permissions') {
    return Response.json([
      { key: 'experts', category: 'nav', label: 'Experts' },
    ]);
  }
  if (url.pathname === '/api/experts/published') {
    return Response.json([
      { id: TEMPLATE, name: 'Demo', slug: 'demo' },
      { id: TEMPLATE_B, name: 'Ops', slug: 'ops' },
    ]);
  }
  if (url.pathname === '/api/auth/ldap/config') {
    return Response.json({ enabled: true, has_bind_password: true });
  }
  if (url.pathname === '/api/agents') {
    const dynamic = octopState.installed.map((entry) => ({
      agent_id: entry.agentId,
      user_id: entry.userId,
      owner_username: 'alice',
      kind: 'expert',
      state: 'running',
      bootstrap_pending: false,
      published_expert_id: entry.templateId,
      last_error: null,
      name: 'Installed',
    }));
    return Response.json([
      {
        agent_id: '8QZKMG',
        user_id: '9',
        owner_username: 'alice',
        kind: 'expert',
        state: 'running',
        bootstrap_pending: true,
        published_expert_id: TEMPLATE,
        last_error: null,
        name: 'Demo',
      },
      {
        agent_id: 'CHAT1',
        user_id: '9',
        owner_username: 'alice',
        kind: 'chat',
        state: 'running',
        bootstrap_pending: false,
        published_expert_id: null,
        last_error: null,
        name: 'Chat',
      },
      ...dynamic,
    ]);
  }
  return Response.json({ ok: true, db: true });
}
