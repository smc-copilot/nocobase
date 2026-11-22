import { describe, expect, it } from 'vitest';

import { ApiError } from '@nocobase/app-server/router';

import { OctopManagementClient } from '../../server/services/octop-management-client.js';
import { assertOctopApiBaseUrl } from '../../server/services/octop-url-guard.js';
import { PRIVATE_LOOKUP, PUBLIC_LOOKUP } from '../helpers/harness.js';

const ALLOW = ['octop.example.com'];

describe('Octop API URL guard', () => {
  it('rejects userinfo, fragments, query strings, and http unless allowed', async () => {
    const cases = [
      'https://user:pass@octop.example.com/',
      'https://octop.example.com/api#token',
      'https://octop.example.com/?next=https://evil.test',
      'http://octop.example.com/',
      'javascript:alert(1)',
      '//octop.example.com/api',
    ];
    for (const raw of cases) {
      await expect(
        assertOctopApiBaseUrl(raw, ALLOW, { lookup: PUBLIC_LOOKUP }),
      ).rejects.toMatchObject({ reason: 'OCTOP_API_URL_NOT_ALLOWED' });
    }
  });

  it('rejects hosts off the Octop allowlist, private DNS, and denied ports', async () => {
    await expect(
      assertOctopApiBaseUrl('https://evil.example.net/', ALLOW, {
        lookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toMatchObject({ reason: 'OCTOP_API_URL_NOT_ALLOWED' });
    await expect(
      assertOctopApiBaseUrl('https://octop.example.com/', ALLOW, {
        lookup: PRIVATE_LOOKUP,
      }),
    ).rejects.toMatchObject({ reason: 'OCTOP_API_URL_NOT_ALLOWED' });
    await expect(
      assertOctopApiBaseUrl('https://octop.example.com:22/', ALLOW, {
        lookup: PUBLIC_LOOKUP,
      }),
    ).rejects.toMatchObject({ reason: 'OCTOP_API_URL_NOT_ALLOWED' });
  });

  it('accepts an allowlisted HTTPS origin and intranet HTTP when opted in', async () => {
    const https = await assertOctopApiBaseUrl(
      'https://octop.example.com:8088/api',
      ALLOW,
      { lookup: PUBLIC_LOOKUP },
    );
    expect(https.hostname).toBe('octop.example.com');
    expect(https.port).toBe('8088');
    const http = await assertOctopApiBaseUrl(
      'http://octop.example.com:8088/',
      ALLOW,
      {
        lookup: PRIVATE_LOOKUP,
        allowHttp: true,
        allowPrivateDns: true,
      },
    );
    expect(http.protocol).toBe('http:');
  });

  it('hides tokens and passes 422 field details without the submitted input', async () => {
    const leaking = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () => {
        throw new Error('authorization: Bearer octop-test-token');
      },
    );
    await expect(leaking.getHealth()).rejects.toMatchObject({
      reason: 'OCTOP_INSTANCE_UNAVAILABLE',
      message: 'The Octop API request failed.',
    });

    const invalid = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'octop-test-token' },
      async () =>
        Response.json(
          {
            detail: [
              {
                loc: ['body', 'role'],
                msg: 'unknown role',
                type: 'value_error',
                input: 'octop-test-token',
              },
            ],
          },
          { status: 422 },
        ),
    );
    await expect(
      invalid.createUser({ username: 'alice', directory: true }),
    ).rejects.toMatchObject({
      reason: 'OCTOP_CREATE_SCHEMA_DRIFT',
      metadata: {
        httpStatus: 422,
        details: [
          {
            loc: ['body', 'role'],
            msg: 'unknown role',
            type: 'value_error',
          },
        ],
      },
    });
    try {
      await invalid.createUser({ username: 'alice' });
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/octop-test-token/);
    }
  });

  it('does not follow a redirect to another host', async () => {
    const client = new OctopManagementClient(
      'https://octop.example.com',
      { mode: 'bearer', token: 'test-token' },
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example.net/api/users' },
        }),
    );
    await expect(client.getHealth()).rejects.toBeInstanceOf(ApiError);
    await expect(client.getHealth()).rejects.toMatchObject({
      reason: 'OCTOP_API_URL_NOT_ALLOWED',
    });
  });
});
