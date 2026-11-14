import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AUDIENCE, createAgentAuthHarness } from '../helpers/harness.js';

/**
 * A23: pinned Octop consumer still expects authorization_code + client_id/secret
 * + code_verifier on token exchange (client_secret_post).
 */
describe('Octop token contract (A23/A24)', () => {
  it('fixture activation still documents client_secret_post token fields', () => {
    const fixtureRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../app-plugin-business-ui-adapter/tests/fixtures/octop',
    );
    const manifest = JSON.parse(
      readFileSync(path.join(fixtureRoot, 'MANIFEST.json'), 'utf8'),
    ) as { octop_commit_short: string };
    expect(manifest.octop_commit_short).toBe('64689a5b');
    const service = readFileSync(
      path.join(fixtureRoot, 'business_ui', 'service.py'),
      'utf8',
    );
    expect(service).toContain('oauth_token_url');
    expect(service).toContain('oauth_revoke_url');
    expect(service).toContain('oauth_client_secret');
    expect(service).toContain('authorization_code');
  });

  it('token exchange accepts client_secret_post field names', async () => {
    const harness = await createAgentAuthHarness();
    try {
      const userId = await harness.createLocalUser('octop@example.com');
      const client = await harness.services.clients.create({
        name: 'Octop',
        redirectUris: ['http://localhost:8090/cb'],
        allowedScopes: ['business-ui:edit'],
      });
      await harness.services.clients.authenticate(
        client.clientId,
        client.clientSecret,
      );
      const grant = await harness.services.grants.createOrReuse({
        clientId: client.clientId,
        localUserId: userId,
        audience: AUDIENCE,
        scopes: ['business-ui:edit'],
      });
      expect(grant.clientId).toBe(client.clientId);
    } finally {
      await harness.close();
    }
  });
});
