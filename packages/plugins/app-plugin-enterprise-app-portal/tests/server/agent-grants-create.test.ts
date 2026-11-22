import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sanitizeCreateOptionsSnapshot } from '../../server/services/agent-grant-operations.js';
import { octopUsernameKey } from '../../server/services/agent-grants-read.js';
import { allowlistOctopCreateFields } from '../../server/services/octop-create-request.js';
import { createPortalHarness, type PortalHarness } from '../helpers/harness.js';

const TEMPLATE = '01M7SH5HEGK5VC8MR87F2T185F';

interface OctopUserRow {
  id: number;
  username: string;
  disabled?: boolean;
}

const octopState: {
  posts: number;
  octopCalls: number;
  lastBody: Record<string, unknown> | undefined;
  users: OctopUserRow[];
  onPost: (() => void) | undefined;
  postGate: Promise<void>;
} = {
  posts: 0,
  octopCalls: 0,
  lastBody: undefined,
  users: [],
  onPost: undefined,
  postGate: Promise.resolve(),
};

describe('octop username key', () => {
  it('folds NFKC, trim, and case, including eszett', () => {
    expect(octopUsernameKey('  Ａlice  ')).toBe('alice');
    expect(octopUsernameKey('ALICE')).toBe(octopUsernameKey('alice'));
    expect(octopUsernameKey('Straße')).toBe('strasse');
    expect(octopUsernameKey('\u0130')).toBe('i\u0307');
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
    octopState.octopCalls = 0;
    octopState.lastBody = undefined;
    octopState.users = [];
    octopState.onPost = undefined;
    octopState.postGate = Promise.resolve();
    const { query } = harness.database.connection();
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
        apiBaseUrl: 'https://octop.example.com',
        apiAuthMode: 'bearer_env',
        apiTokenEnv: 'OCTOP_ADMIN_TOKEN',
      },
      'admin-1',
    );
  });

  it('does not POST when the Octop account already exists', async () => {
    octopState.users = [{ id: 9, username: 'Alice', disabled: true }];
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_ACCOUNT_EXISTS' });
    expect(octopState.posts).toBe(0);
  });

  it('does not call Octop when Casdoor does not allow the employee', async () => {
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/bob', expertTemplateId: TEMPLATE },
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
      { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
      'admin-1',
    );
    await enteredPromise;
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'AGENT_GRANT_OPERATION_IN_PROGRESS' });
    expect(octopState.posts).toBe(1);
    release();
    const created = await first;
    expect(created.status).toBe('BOOTSTRAP_PENDING');
    expect(octopState.posts).toBe(1);
  });

  it('sends directory=true and never a password', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      {
        casdoorUserId: 'smartcore/alice',
        expertTemplateId: TEMPLATE,
        displayName: 'Alice',
      },
      'admin-1',
    );
    expect(octopState.posts).toBe(1);
    expect(octopState.lastBody).toMatchObject({
      username: 'alice',
      directory: true,
      expert_template_source: 'published',
      expert_template_id: TEMPLATE,
      create_default_expert: true,
    });
    expect(octopState.lastBody).not.toHaveProperty('password');
    expect(JSON.stringify(created.createOptionsSnapshot)).not.toMatch(
      /password|octop-test-token|portal-secret/i,
    );
    expect(created.createOptionsSnapshot).toMatchObject({ directory: true });
  });

  it('keeps a timed-out create as outcome unknown and does not POST again', async () => {
    octopState.onPost = () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
        'admin-1',
      ),
    ).rejects.toMatchObject({ reason: 'OCTOP_USER_CREATE_OUTCOME_UNKNOWN' });
    octopState.onPost = undefined;
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
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
          expertTemplateId: TEMPLATE,
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
    const employees =
      await harness.services.agentGrantsRead.listAuthorizedEmployees('octop');
    expect(employees.map((entry) => entry.username).sort()).toEqual([
      'Alice',
      'alice',
      'dave',
    ]);
    const options =
      await harness.services.agentGrantsRead.listCreateOptions('octop');
    expect(options.roles.map((role) => role.id)).toEqual(['user']);
    expect(options.directoryLocked).toBe(true);
    expect(options.ldapConfigured).toBe(true);
    expect(options.supportedBackendTypes).toEqual(['docker']);
    octopState.users = [{ id: 9, username: 'alice' }];
    const state = await harness.services.agentGrantsRead.getEmployeeOctopState(
      'octop',
      'smartcore/alice',
    );
    expect(state.experts.map((expert) => expert.agentId)).toEqual(['8QZKMG']);
    expect(state.experts.every((expert) => expert.kind === 'expert')).toBe(
      true,
    );
  });

  it('submits the original Casdoor username', async () => {
    const created = await harness.services.agentGrants.createGrant(
      'octop',
      { casdoorUserId: 'smartcore/Alice', expertTemplateId: TEMPLATE },
      'admin-1',
    );
    expect(octopState.lastBody?.username).toBe('Alice');
    expect(created.username).toBe('Alice');
  });

  it('reconciles a timed-out create without another POST', async () => {
    octopState.onPost = () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    await expect(
      harness.services.agentGrants.createGrant(
        'octop',
        { casdoorUserId: 'smartcore/alice', expertTemplateId: TEMPLATE },
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
      directory: false,
      token_quota: 3,
      expert_template_source: 'catalog',
    });
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('evil');
    expect(body.directory).toBe(true);
    expect(body.expert_template_source).toBe('published');
    expect(body.token_quota).toBe(3);
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
        default_expert: {
          requested: true,
          source: 'published',
          template_id: TEMPLATE,
          status: 'created',
          agent_id: '8QZKMG',
          bootstrap_status: 'pending',
          error_code: null,
          error_message: null,
        },
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
        policies: { max_agents: 1, allowed_backend_types: ['docker'] },
      },
    ]);
  }
  if (url.pathname === '/api/users/permissions') {
    return Response.json([
      { key: 'experts', category: 'nav', label: 'Experts' },
    ]);
  }
  if (url.pathname === '/api/experts/published') {
    return Response.json([{ id: TEMPLATE, name: 'Demo', slug: 'demo' }]);
  }
  if (url.pathname === '/api/auth/ldap/config') {
    return Response.json({ enabled: true, has_bind_password: true });
  }
  if (url.pathname === '/api/agents') {
    return Response.json([
      {
        agent_id: '8QZKMG',
        user_id: '23',
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
    ]);
  }
  return Response.json({ ok: true, db: true });
}
