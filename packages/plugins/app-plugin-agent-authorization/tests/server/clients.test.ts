import { afterEach, describe, expect, it } from 'vitest';

import {
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

describe('agent clients (A02/A05/A21)', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('registers two clients, rotates secret, and never echoes plaintext on list', async () => {
    harness = await createAgentAuthHarness();
    const octop = await harness.services.clients.create({
      name: 'Octop local',
      redirectUris: ['http://localhost:8090/oauth/callback'],
      allowedScopes: ['business-ui:edit', 'business-ui:view'],
      instanceLabel: 'octop-local',
    });
    const agentB = await harness.services.clients.create({
      name: 'Agent B',
      redirectUris: ['http://localhost:9090/callback'],
      allowedScopes: ['business-ui:view'],
    });

    expect(octop.clientSecret).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(agentB.clientId).not.toBe(octop.clientId);

    const listed = await harness.services.clients.list();
    expect(listed).toHaveLength(2);
    for (const client of listed) {
      expect(client).not.toHaveProperty('clientSecret');
      expect(client.hasSecret).toBe(true);
    }

    const rotated = await harness.services.clients.rotateSecret(octop.clientId);
    expect(rotated.clientSecret).not.toBe(octop.clientSecret);
    expect(rotated.secretVersion).toBe(2);

    await expect(
      harness.services.clients.authenticate(octop.clientId, octop.clientSecret),
    ).rejects.toMatchObject({ reason: 'INVALID_CLIENT' });
    await harness.services.clients.authenticate(
      octop.clientId,
      rotated.clientSecret,
    );

    await harness.services.clients.update(octop.clientId, { enabled: false });
    await expect(
      harness.services.clients.authenticate(
        octop.clientId,
        rotated.clientSecret,
      ),
    ).rejects.toMatchObject({ reason: 'UNAUTHORIZED_CLIENT' });
  });
});
