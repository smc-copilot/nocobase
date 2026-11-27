import { describe, expect, it } from 'vitest';

import { ApiError } from '@nocobase/app-server/router';

import {
  assertPublicHttpsUrl,
  composeLaunchUrl,
  hostAllowed,
  isBlockedIp,
  parseRelativeTargetPath,
} from '../../server/services/url-guard.js';
import { PRIVATE_LOOKUP, PUBLIC_LOOKUP } from '../helpers/harness.js';

describe('URL / SSRF guard', () => {
  it('rejects http, userinfo, protocol-relative, javascript and literal IPs', async () => {
    const cases = [
      'http://example.com/',
      'https://user:pass@example.com/',
      '//example.com/path',
      'javascript:alert(1)',
      'https://127.0.0.1/',
      'https://example.com\\@evil.test/',
    ];
    for (const raw of cases) {
      await expect(
        assertPublicHttpsUrl(raw, ['example.com'], PUBLIC_LOOKUP),
      ).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('rejects hosts off the deployment allowlist and private DNS', async () => {
    await expect(
      assertPublicHttpsUrl(
        'https://evil.example.net/',
        ['example.com'],
        PUBLIC_LOOKUP,
      ),
    ).rejects.toMatchObject({ reason: 'HOST_NOT_ALLOWLISTED' });
    await expect(
      assertPublicHttpsUrl(
        'https://example.com/',
        ['example.com'],
        PRIVATE_LOOKUP,
      ),
    ).rejects.toMatchObject({ reason: 'URL_RESOLVES_PRIVATE' });
  });

  it('accepts an allowlisted public HTTPS host and relative target paths', async () => {
    const url = await assertPublicHttpsUrl(
      'https://docs.example.com/app',
      ['example.com'],
      PUBLIC_LOOKUP,
    );
    expect(url.hostname).toBe('docs.example.com');
    expect(hostAllowed('docs.example.com', ['example.com'])).toBe(true);
    expect(parseRelativeTargetPath('/oa/inbox')).toBe('/oa/inbox');
    expect(composeLaunchUrl('https://example.com/app', '/')).toBe(
      'https://example.com/app/',
    );
    expect(composeLaunchUrl('https://example.com/app', '/inbox')).toBe(
      'https://example.com/inbox',
    );
    expect(() => parseRelativeTargetPath('//evil.test')).toThrow(ApiError);
    expect(isBlockedIp('10.0.0.8')).toBe(true);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });
});
