import { afterEach, describe, expect, it } from 'vitest';

import {
  AUDIENCE,
  createAgentAuthHarness,
  type AgentAuthHarness,
} from '../helpers/harness.js';

describe('agent grants (A09/A13)', () => {
  let harness: AgentAuthHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('lets one user authorize two clients and revoke A without affecting B', async () => {
    harness = await createAgentAuthHarness();
    const userId = await harness.createLocalUser('grants@example.com');
    const clientA = await harness.services.clients.create({
      name: 'A',
      redirectUris: ['http://localhost:1/a'],
      allowedScopes: ['business-ui:edit'],
    });
    const clientB = await harness.services.clients.create({
      name: 'B',
      redirectUris: ['http://localhost:1/b'],
      allowedScopes: ['business-ui:view'],
    });

    const grantA = await harness.services.grants.createOrReuse({
      clientId: clientA.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:edit'],
    });
    const grantB = await harness.services.grants.createOrReuse({
      clientId: clientB.clientId,
      localUserId: userId,
      audience: AUDIENCE,
      scopes: ['business-ui:view'],
    });

    const revoked = await harness.services.grants.revoke(grantA.id, userId);
    expect(revoked.status).toBe('revoked');
    expect(revoked.revision).toBe(grantA.revision + 1);

    await expect(
      harness.services.grants.requireActive(grantA.id),
    ).rejects.toMatchObject({ reason: 'INVALID_GRANT' });

    const stillB = await harness.services.grants.requireActive(grantB.id);
    expect(stillB.status).toBe('active');
    expect(stillB.clientId).toBe(clientB.clientId);
  });
});
