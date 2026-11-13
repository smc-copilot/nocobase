// @vitest-environment node

import type { MiddlewareHandler } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  SETTINGS_MAPPING,
  SETTINGS_SUBJECT_BINDINGS,
  SETTINGS_SYNC,
} from '../../server/config.js';
import type { DirectoryUser } from '../../server/directory.js';
import { createAdminRouter } from '../../server/routes/admin.js';
import {
  createIdentityHarness,
  ISSUER,
  type IdentityHarness,
} from '../helpers/harness.js';

describe('identity administration routes (IAM-009, IAM-010)', () => {
  let harness: IdentityHarness;
  let granted: Set<string>;
  let signedIn: boolean;
  let router: ReturnType<typeof createAdminRouter>;

  beforeAll(async () => {
    harness = await createIdentityHarness({
      mappablePermissionSets: ['content-editor'],
    });
    const authenticate: MiddlewareHandler = async (context, next) => {
      if (!signedIn) {
        return context.json(
          {
            error: {
              code: 401,
              status: 'UNAUTHENTICATED',
              reason: 'AUTH_REQUIRED',
            },
          },
          401,
        );
      }
      context.set('auth', { user: { id: 'admin-1' } } as never);
      await next();
    };
    router = createAdminRouter({
      services: () => harness.services,
      authenticate: [authenticate],
      authorize: (_context, item, action) =>
        Promise.resolve(granted.has(`${item}:${action}`)),
    });
  });
  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    signedIn = true;
    granted = new Set();
    const { query } = harness.database.connection();
    for (const table of [
      'businessUiSubjectBindings',
      'managedPermissionAssignments',
      'identityMappingRules',
      'identitySyncRuns',
      'identityProviders',
      'externalIdentities',
      'identityAuditEvents',
    ]) {
      await query.deleteFrom(table).allowAllRows().execute();
    }
    await query.deleteFrom('account').allowAllRows().execute();
    await query.deleteFrom('user').allowAllRows().execute();
  });

  const send = (method: string, path: string, body?: unknown) =>
    router.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const allow = (...entries: string[]): void => {
    granted = new Set(entries);
  };

  it('answers 401 without a session and 403 without the settings grant, before touching data', async () => {
    signedIn = false;
    expect((await send('GET', '/syncStatus')).status).toBe(401);
    signedIn = true;
    for (const [method, path, body] of [
      ['GET', '/syncStatus'],
      ['GET', '/syncRuns'],
      ['POST', '/syncRuns', {}],
      ['POST', '/syncRuns/preview', {}],
      ['GET', '/providers'],
      ['PUT', '/providers/casdoor', { issuer: ISSUER }],
      ['GET', '/mappingRules'],
      [
        'POST',
        '/mappingRules',
        {
          ruleId: 'x',
          providerId: 'casdoor',
          claim: 'groups',
          claimValue: 'a',
          permissionSetKey: 'content-editor',
        },
      ],
      ['DELETE', '/mappingRules/x'],
      ['GET', '/subjectBindings'],
      [
        'POST',
        '/subjectBindings/preview',
        {
          rows: [
            { connectionId: 'c', octopSubject: 's', externalIdentityId: 'e' },
          ],
        },
      ],
      [
        'POST',
        '/subjectBindings/commit',
        {
          rows: [
            { connectionId: 'c', octopSubject: 's', externalIdentityId: 'e' },
          ],
        },
      ],
    ] as const) {
      const response = await send(method, path, body);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { reason: 'IDENTITY_ADMIN_FORBIDDEN' },
      });
    }
  });

  it('checks the right action: read does not allow run or configure', async () => {
    allow(
      `${SETTINGS_SYNC}:read`,
      `${SETTINGS_MAPPING}:read`,
      `${SETTINGS_SUBJECT_BINDINGS}:read`,
    );
    expect((await send('GET', '/syncStatus')).status).toBe(200);
    expect((await send('POST', '/syncRuns/preview', {})).status).toBe(403);
    expect(
      (await send('PUT', '/providers/casdoor', { issuer: ISSUER })).status,
    ).toBe(403);
    expect(
      (
        await send('POST', '/subjectBindings/commit', {
          rows: [
            { connectionId: 'c', octopSubject: 's', externalIdentityId: 'e' },
          ],
        })
      ).status,
    ).toBe(403);
  });

  it('never echoes the provider secret and reports whether admission is configured', async () => {
    allow(`${SETTINGS_MAPPING}:read`, `${SETTINGS_MAPPING}:configure`);
    const put = await send('PUT', '/providers/casdoor', {
      issuer: ISSUER,
      clientId: 'client-1',
      secretRef: 'env:SUPER_SECRET',
    });
    expect(put.status).toBe(200);
    const body = await put.text();
    expect(body).not.toContain('SUPER_SECRET');
    expect(JSON.parse(body).data).toMatchObject({
      providerId: 'casdoor',
      secretConfigured: true,
      admissionConfigured: false,
    });
    const list = await (await send('GET', '/providers')).text();
    expect(list).not.toContain('SUPER_SECRET');

    // Omitting secretRef keeps the stored one.
    await send('PUT', '/providers/casdoor', {
      issuer: ISSUER,
      admissionPolicy: { allowOrganizations: ['acme'] },
    });
    const kept = (await (await send('GET', '/providers')).json()) as {
      data: { secretConfigured: boolean; admissionConfigured: boolean }[];
    };
    expect(kept.data[0]).toMatchObject({
      secretConfigured: true,
      admissionConfigured: true,
    });
    const audit = JSON.stringify(
      await harness.services.audit.list({ targetType: 'identityProvider' }),
    );
    expect(audit).not.toContain('SUPER_SECRET');
  });

  it('manages mapping rules and refuses sets off the allowlist', async () => {
    allow(`${SETTINGS_MAPPING}:read`, `${SETTINGS_MAPPING}:configure`);
    await send('PUT', '/providers/casdoor', { issuer: ISSUER });
    const rule = {
      ruleId: 'r1',
      providerId: 'casdoor',
      claim: 'groups',
      claimValue: 'a',
      permissionSetKey: 'content-editor',
    };
    expect((await send('POST', '/mappingRules', rule)).status).toBe(201);
    expect((await send('POST', '/mappingRules', rule)).status).toBe(409);
    const refused = await send('POST', '/mappingRules', {
      ...rule,
      ruleId: 'r2',
      permissionSetKey: 'root',
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { reason: 'PERMISSION_SET_NOT_MAPPABLE' },
    });
    expect(
      (await send('PATCH', '/mappingRules/r1', { enabled: false })).status,
    ).toBe(200);
    expect(
      (await send('PATCH', '/mappingRules/missing', { enabled: false })).status,
    ).toBe(404);
    const listed = (await (
      await send('GET', '/mappingRules?providerId=casdoor')
    ).json()) as {
      data: { ruleId: string; enabled: boolean }[];
    };
    expect(listed.data).toMatchObject([{ ruleId: 'r1', enabled: false }]);
    expect((await send('DELETE', '/mappingRules/r1')).status).toBe(204);
  });

  it('runs and previews sync, lists runs and reports a missing batch as 404', async () => {
    allow(
      `${SETTINGS_SYNC}:read`,
      `${SETTINGS_SYNC}:run`,
      `${SETTINGS_MAPPING}:configure`,
    );
    await send('PUT', '/providers/casdoor', { issuer: ISSUER });
    const users: DirectoryUser[] = [];
    harness.directory.current = {
      listUsers: () => Promise.resolve({ users }),
    };
    const preview = await send('POST', '/syncRuns/preview', {
      providerId: 'casdoor',
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      data: { result: 'preview', dryRun: true },
    });
    const created = await send('POST', '/syncRuns', {
      providerId: 'casdoor',
      batchId: 'manual-1',
    });
    expect(created.status).toBe(201);
    expect(
      (
        await send('POST', '/syncRuns', {
          providerId: 'casdoor',
          batchId: 'manual-1',
        })
      ).status,
    ).toBe(409);
    expect(
      (await send('POST', '/syncRuns', { batchId: 'preview' })).status,
    ).toBe(400);
    expect((await send('GET', '/syncRuns/manual-1')).status).toBe(200);
    expect((await send('GET', '/syncRuns/absent')).status).toBe(404);
    const listed = (await (await send('GET', '/syncRuns')).json()) as {
      data: unknown[];
    };
    expect(listed.data).toHaveLength(2);
    const status = (await (await send('GET', '/syncStatus')).json()) as {
      data: { directoryConfigured: boolean };
    };
    expect(status.data.directoryConfigured).toBe(true);
  });

  it('previews and commits subject bindings, answering a conflicting commit with the row report', async () => {
    allow(
      `${SETTINGS_SUBJECT_BINDINGS}:read`,
      `${SETTINGS_SUBJECT_BINDINGS}:import`,
    );
    const alice = await harness.createLocalUser('alice@acme.test');
    const bob = await harness.createLocalUser('bob@acme.test');
    const aliceIdentity = await harness.bind('sub-alice', alice);
    await harness.bind('sub-bob', bob);

    const good = {
      rows: [
        {
          connectionId: 'octop-1',
          octopSubject: 'o-alice',
          externalIdentityId: aliceIdentity,
        },
      ],
    };
    const preview = await send('POST', '/subjectBindings/preview', good);
    expect(await preview.json()).toMatchObject({
      data: { summary: { create: 1 } },
    });
    expect((await send('GET', '/subjectBindings')).status).toBe(200);
    expect(
      (
        (await (await send('GET', '/subjectBindings')).json()) as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(0);

    expect((await send('POST', '/subjectBindings/commit', good)).status).toBe(
      200,
    );
    expect(
      (
        (await (await send('GET', '/subjectBindings')).json()) as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(1);

    const mismatch = {
      rows: [
        {
          connectionId: 'octop-1',
          octopSubject: 'o-bob',
          issuer: ISSUER,
          subject: 'sub-bob',
          localUserId: alice,
        },
      ],
    };
    const conflict = await send('POST', '/subjectBindings/commit', mismatch);
    expect(conflict.status).toBe(409);
    const payload = (await conflict.json()) as {
      error: {
        reason: string;
        metadata: { report: { rows: { conflicts: string[] }[] } };
      };
    };
    expect(payload.error.reason).toBe('SUBJECT_BINDING_CONFLICTS');
    expect(payload.error.metadata.report.rows[0]?.conflicts).toEqual([
      'SUBJECT_MISMATCH',
    ]);
    expect(
      (
        (await (await send('GET', '/subjectBindings')).json()) as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(1);
  });

  it('rejects unknown body fields', async () => {
    allow(`${SETTINGS_MAPPING}:configure`);
    const response = await send('PUT', '/providers/casdoor', {
      issuer: ISSUER,
      bogus: true,
    });
    expect(response.status).toBe(400);
  });
});
