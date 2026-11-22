import { describe, expect, it, vi } from 'vitest';

import { OctopManagementClient } from '../../server/services/octop-management-client.js';

describe('OctopManagementClient.installPublishedExpertForUser', () => {
  it('posts to install with as_user query and never omits it', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe('/api/experts/published/tpl-9/install');
        expect(url.searchParams.get('as_user')).toBe('42');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          name: 'Ops Helper',
          description: 'Installed for Bob',
          backend: { type: 'docker' },
        });
        return Response.json(
          {
            agent_id: 'agt-99',
            user_id: 42,
            name: 'Ops Helper',
            state: 'running',
            published_expert_id: 'tpl-9',
            bootstrap_pending: true,
          },
          { status: 201 },
        );
      },
    );

    const client = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      fetchImpl,
    );

    await expect(
      client.installPublishedExpertForUser(42, 'tpl-9', {
        name: 'Ops Helper',
        description: 'Installed for Bob',
        backend: { type: 'docker' },
      }),
    ).resolves.toEqual({
      agentId: 'agt-99',
      name: 'Ops Helper',
      state: 'running',
      publishedExpertId: 'tpl-9',
      userId: '42',
      bootstrapPending: true,
      alreadyInstalled: false,
    });
  });

  it('treats 200 already-installed responses as idempotent success', async () => {
    const client = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () =>
        Response.json(
          {
            agent_id: 'agt-1',
            user_id: 42,
            name: 'Helper',
            state: 'running',
            published_expert_id: 'tpl-9',
            bootstrap_pending: false,
            already_installed: true,
          },
          { status: 200 },
        ),
    );

    await expect(
      client.installPublishedExpertForUser('42', 'tpl-9', {
        name: 'Helper',
        description: '',
      }),
    ).resolves.toMatchObject({
      agentId: 'agt-1',
      userId: '42',
      alreadyInstalled: true,
      bootstrapPending: false,
    });
  });

  it('maps 403 and 404 to Octop rejection reasons', async () => {
    const forbidden = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () =>
        Response.json({ error: { message: 'forbidden' } }, { status: 403 }),
    );
    await expect(
      forbidden.installPublishedExpertForUser(42, 'tpl-9', {
        name: 'Helper',
        description: '',
      }),
    ).rejects.toMatchObject({
      reason: 'OCTOP_PERMISSION_INSUFFICIENT',
    });

    const missing = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () =>
        Response.json({ error: { message: 'not found' } }, { status: 404 }),
    );
    await expect(
      missing.installPublishedExpertForUser(99, 'missing', {
        name: 'Helper',
        description: '',
      }),
    ).rejects.toMatchObject({
      reason: 'OCTOP_EXPERT_INSTALL_REJECTED',
    });
  });

  it('maps install timeout to expert outcome unknown', async () => {
    const client = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () => {
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      },
    );
    await expect(
      client.installPublishedExpertForUser(42, 'tpl-9', {
        name: 'Helper',
        description: '',
      }),
    ).rejects.toMatchObject({
      reason: 'OCTOP_EXPERT_INSTALL_OUTCOME_UNKNOWN',
    });
  });
});
