import { describe, expect, it, vi } from 'vitest';

import { OctopManagementClient } from '../../server/services/octop-management-client.js';

describe('OctopManagementClient.installExpertToUser', () => {
  it('posts to the target-user published expert install path', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://octop.example.com/api/users/42/experts/published/tpl-9/install',
        );
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          name: 'Ops Helper',
          description: 'Installed for Bob',
        });
        return Response.json(
          {
            agent_id: 'agt-99',
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
      client.installExpertToUser('42', 'tpl-9', {
        name: 'Ops Helper',
        description: 'Installed for Bob',
      }),
    ).resolves.toEqual({
      agentId: 'agt-99',
      name: 'Ops Helper',
      state: 'running',
      publishedExpertId: 'tpl-9',
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
      client.installExpertToUser('42', 'tpl-9', {
        name: 'Helper',
        description: '',
      }),
    ).resolves.toMatchObject({
      agentId: 'agt-1',
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
      forbidden.installExpertToUser('42', 'tpl-9', {
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
      missing.installExpertToUser('99', 'missing', {
        name: 'Helper',
        description: '',
      }),
    ).rejects.toMatchObject({
      reason: 'OCTOP_EXPERT_INSTALL_REJECTED',
    });
  });
});
