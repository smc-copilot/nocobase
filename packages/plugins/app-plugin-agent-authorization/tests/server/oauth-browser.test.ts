import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { createAdminRouter } from '../../server/routes/admin.js';
import { createMeRouter } from '../../server/routes/me.js';
import { createOAuthRouter } from '../../server/routes/oauth.js';
import {
  AUDIENCE,
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

const CHALLENGE = 'a'.repeat(43);

function locationOf(response: Response): string {
  const raw = response.headers.get('Location');
  if (!raw) throw new Error('Missing Location');
  if (/^https?:/iu.test(raw)) {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  }
  return raw;
}

function withUser(userId?: string): MiddlewareHandler {
  return async (context, next) => {
    if (userId) {
      (
        context as Context<{
          Variables: {
            auth: { user: { id: string }; session: { id: string } };
          };
        }>
      ).set('auth', {
        user: { id: userId },
        session: { id: 'session' },
      });
    }
    await next();
  };
}

function authorizeQuery(clientId = 'client-1'): string {
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'http://localhost:8090/cb',
    response_type: 'code',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'business-ui:view',
    state: 'xyz',
  }).toString();
}

describe('oauth authorize redirects (C04)', () => {
  it.each([
    { base: '', login: '/login' },
    { base: '/main', login: '/main/login' },
  ])(
    'sends an unauthenticated browser at base "$base" to login with redirect=',
    async ({ base, login }) => {
      const router = createOAuthRouter({
        services: () => {
          throw new Error('services must not run before login');
        },
        authenticate: withUser(),
        optionalAuthenticate: withUser(),
        defaultAudience: () => AUDIENCE,
        publicBasePath: () => base,
      });
      const response = await new Hono()
        .route('/agentAuthorization', router)
        .request(`/agentAuthorization/oauth/authorize?${authorizeQuery()}`);

      expect(response.status).toBe(302);
      const location = locationOf(response);
      expect(location.startsWith(`${login}?redirect=`)).toBe(true);
      expect(location).not.toContain('callbackURL');
      const redirect = new URL(location, 'http://app.local').searchParams.get(
        'redirect',
      );
      expect(redirect?.startsWith('/agent-authorization/authorize?')).toBe(
        true,
      );
      expect(redirect).toContain('client_id=client-1');
      expect(redirect).toContain('state=xyz');
      expect(redirect).not.toContain('/api/');
      expect(redirect?.startsWith('/main/')).toBe(false);
    },
  );
});

describe('oauth consent redirect and consent context (C04/C06)', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it.each([
    { base: '', consent: '/agent-authorization/consent' },
    { base: '/main', consent: '/main/agent-authorization/consent' },
  ])(
    'sends a signed-in user without a grant to $consent',
    async ({ base, consent }) => {
      harness = await createAgentAuthHarness();
      const userId = await harness.createLocalUser(
        `consent-${base}@example.com`,
      );
      const client = await harness.services.clients.create({
        name: 'Octop',
        instanceLabel: 'Control',
        redirectUris: ['http://localhost:8090/cb'],
        allowedScopes: ['business-ui:view', 'business-ui:edit'],
      });
      const router = createOAuthRouter({
        services: () => harness.services,
        authenticate: withUser(userId),
        optionalAuthenticate: withUser(userId),
        defaultAudience: () => AUDIENCE,
        publicBasePath: () => base,
      });
      const response = await new Hono()
        .route('/agentAuthorization', router)
        .request(
          `/agentAuthorization/oauth/authorize?${authorizeQuery(client.clientId)}`,
        );

      expect(response.status).toBe(302);
      const location = locationOf(response);
      expect(location.startsWith(`${consent}?`)).toBe(true);
      expect(location).toContain(
        `client_id=${encodeURIComponent(client.clientId)}`,
      );
      expect(location).not.toContain('callbackURL');
    },
  );

  it('returns server consent metadata and grant expiry when a grant exists', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('meta@example.com');
    const client = await harness.services.clients.create({
      name: 'Octop Desk',
      instanceLabel: 'Plant A',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:view'],
    });
    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const router = createOAuthRouter({
      services: () => harness.services,
      authenticate: withUser(userId),
      optionalAuthenticate: withUser(),
      defaultAudience: () => AUDIENCE,
      publicBasePath: () => '',
    });
    const query = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: 'http://localhost:8090/cb',
      scope: 'business-ui:view',
    });
    const response = await new Hono()
      .route('/agentAuthorization', router)
      .request(`/agentAuthorization/oauth/consent-context?${query}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        name: string;
        instanceLabel: string | null;
        audience: string;
        requestedScopes: string[];
        allowedScopes: string[];
        redirectUri: string | null;
        grant: { grantId: string; expiresAt: string | null } | null;
      };
    };
    expect(body.data).toMatchObject({
      name: 'Octop Desk',
      instanceLabel: 'Plant A',
      audience: AUDIENCE,
      requestedScopes: ['business-ui:view'],
      allowedScopes: ['business-ui:view'],
      redirectUri: 'http://localhost:8090/cb',
      grant: { grantId: grant.id, expiresAt: null },
    });
  });

  it('returns access_denied and creates no grant when consent is denied', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('deny@example.com');
    const client = await harness.services.clients.create({
      name: 'Octop',
      redirectUris: ['http://localhost:8090/cb'],
      allowedScopes: ['business-ui:view'],
    });
    const router = createOAuthRouter({
      services: () => harness.services,
      authenticate: withUser(userId),
      optionalAuthenticate: withUser(userId),
      defaultAudience: () => AUDIENCE,
      publicBasePath: () => '',
    });
    const response = await new Hono()
      .route('/agentAuthorization', router)
      .request('/agentAuthorization/oauth/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: client.clientId,
          redirect_uri: 'http://localhost:8090/cb',
          state: 'denied-state',
          code_challenge: CHALLENGE,
          scope: 'business-ui:view',
          decision: 'deny',
        }),
      });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { redirectUri: string } };
    const redirect = new URL(body.data.redirectUri);
    expect(redirect.origin + redirect.pathname).toBe(
      'http://localhost:8090/cb',
    );
    expect(redirect.searchParams.get('error')).toBe('access_denied');
    expect(redirect.searchParams.get('state')).toBe('denied-state');
    expect(await harness.services.grants.listForUser(userId)).toEqual([]);
  });
});

describe('admin and me audit (C06)', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('records the actor for client create, update, secret rotation, and grant revoke', async () => {
    harness = await createAgentAuthHarness();
    const adminId = await harness.createLocalUser('admin@example.com');
    const userId = await harness.createLocalUser('holder@example.com');
    const admin = createAdminRouter({
      services: () => harness.services,
      authenticate: [withUser(adminId)],
      authorize: async () => true,
    });
    const app = new Hono().route('/agentAuthorization', admin);

    const created = await app.request('/agentAuthorization/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Octop',
        redirectUris: ['http://localhost:8090/cb'],
        allowedScopes: ['business-ui:view'],
      }),
    });
    expect(created.status).toBe(200);
    const client = ((await created.json()) as { data: { clientId: string } })
      .data;

    const updated = await app.request(
      `/agentAuthorization/clients/${client.clientId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(updated.status).toBe(200);

    const rotated = await app.request(
      `/agentAuthorization/clients/${client.clientId}/rotateSecret`,
      { method: 'POST' },
    );
    expect(rotated.status).toBe(200);
    const rotatedSecret = (
      (await rotated.json()) as { data: { clientSecret: string } }
    ).data.clientSecret;

    const grant = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const revoked = await app.request(
      `/agentAuthorization/grants/${grant.id}/revoke`,
      { method: 'POST' },
    );
    expect(revoked.status).toBe(200);

    const me = new Hono().route(
      '/agentAuthorization',
      createMeRouter({
        services: () => harness.services,
        authenticate: withUser(userId),
      }),
    );
    const second = await harness.services.grants.createOrReuse({
      clientId: client.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });
    const mine = await me.request(
      `/agentAuthorization/me/grants/${second.id}/revoke`,
      { method: 'POST' },
    );
    expect(mine.status).toBe(200);

    const events = await harness.services.audit.list();
    const actions = events.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'client.create',
        'client.update',
        'client.rotateSecret',
        'grant.revoke',
      ]),
    );
    const byAction = (action: string) =>
      events.find((event) => event.action === action);
    expect(byAction('client.create')?.localUserId).toBe(adminId);
    expect(byAction('client.update')?.localUserId).toBe(adminId);
    expect(byAction('client.rotateSecret')?.localUserId).toBe(adminId);
    const revokes = events.filter((event) => event.action === 'grant.revoke');
    expect(revokes.map((event) => event.localUserId).sort()).toEqual(
      [adminId, userId].sort(),
    );
    expect(JSON.stringify(events)).not.toContain(rotatedSecret);
  });
});
