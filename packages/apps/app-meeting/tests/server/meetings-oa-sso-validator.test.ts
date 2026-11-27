import { expect, test, vi } from 'vitest';

import { readNamedCookie } from '../../server/meetings/oa/sso-cookie.js';
import {
  employeeNosMatch,
  normalizeEmployeeNo,
} from '../../server/meetings/oa/sso-normalize.js';
import {
  createOaSsoValidator,
  parseOaLoginName,
  setOaSsoFetchForTests,
} from '../../server/meetings/oa/sso-validator.js';

test('normalizeEmployeeNo trims Unicode whitespace and folds case', () => {
  expect(normalizeEmployeeNo('\u00A0SMC-SZ-HR21007\t')).toBe('smc-sz-hr21007');
  expect(employeeNosMatch(' SMC-SZ-HR21007 ', 'smc-sz-hr21007')).toBe(true);
  expect(employeeNosMatch('smc-sz-hr21007', 'smc-sz-hr21008')).toBe(false);
});

test('readNamedCookie reports missing, ok, and ambiguous values', () => {
  expect(readNamedCookie(undefined, 'LtpaToken')).toEqual({ kind: 'missing' });
  expect(readNamedCookie('LtpaToken=abc', 'LtpaToken')).toEqual({
    kind: 'ok',
    value: 'abc',
  });
  expect(
    readNamedCookie('LtpaToken=a; path=/; LtpaToken=b', 'LtpaToken').kind,
  ).toBe('ambiguous');
});

test('parseOaLoginName prefers loginName and nested data', () => {
  expect(parseOaLoginName({ loginName: 'smc-sz-hr21007' })).toBe(
    'smc-sz-hr21007',
  );
  expect(parseOaLoginName({ data: { loginName: 'x' } })).toBe('x');
  expect(parseOaLoginName({ data: 'y' })).toBe('y');
  expect(parseOaLoginName('<html></html>')).toBe('<html></html>');
  expect(parseOaLoginName({ ok: true })).toBeNull();
});

test('validator maps OA outcomes to normalized kinds', async () => {
  const config = {
    enabled: true,
    validateUrl:
      'https://oa.example.test/loginService.do?method=getTokenLoginName',
    cookieName: 'LtpaToken',
    timeoutMs: 5_000,
    validateMethod: 'GET' as const,
  };

  const verified = createOaSsoValidator({
    config,
    fetchImpl: vi.fn(async () =>
      Response.json({ loginName: 'smc-sz-hr21007' }),
    ),
  });
  await expect(
    verified.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toEqual({ kind: 'verified', employeeNo: 'smc-sz-hr21007' });

  const rejected = createOaSsoValidator({
    config,
    fetchImpl: vi.fn(async () => new Response('nope', { status: 401 })),
  });
  await expect(
    rejected.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toMatchObject({ kind: 'rejected' });

  const unavailable = createOaSsoValidator({
    config,
    fetchImpl: vi.fn(async () => new Response('busy', { status: 503 })),
  });
  await expect(
    unavailable.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toMatchObject({ kind: 'unavailable' });

  const contract = createOaSsoValidator({
    config,
    fetchImpl: vi.fn(
      async () =>
        new Response('<html>login</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    ),
  });
  await expect(
    contract.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toMatchObject({ kind: 'contract_error' });

  const redirect = createOaSsoValidator({
    config,
    fetchImpl: vi.fn(async () => {
      throw new TypeError('fetch failed due to redirect');
    }),
  });
  await expect(
    redirect.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toMatchObject({ kind: 'contract_error', detail: 'redirect' });

  setOaSsoFetchForTests(undefined);
});

test('validator allows http validate URL when allowInsecureHttp is on', async () => {
  const httpConfig = {
    enabled: true,
    validateUrl:
      'http://oa.example.test:2166/data/sys-authentication/loginService.do?method=getTokenLoginName',
    cookieName: 'LtpaToken',
    timeoutMs: 5_000,
    validateMethod: 'GET' as const,
    allowInsecureHttp: true,
  };
  const verified = createOaSsoValidator({
    config: httpConfig,
    fetchImpl: vi.fn(async () =>
      Response.json({ loginName: 'smc-sz-hr21007' }),
    ),
  });
  await expect(
    verified.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toEqual({ kind: 'verified', employeeNo: 'smc-sz-hr21007' });

  const blocked = createOaSsoValidator({
    config: { ...httpConfig, allowInsecureHttp: false },
    fetchImpl: vi.fn(async () =>
      Response.json({ loginName: 'smc-sz-hr21007' }),
    ),
  });
  await expect(
    blocked.validate({ cookieName: 'LtpaToken', cookieValue: 'tok' }),
  ).resolves.toMatchObject({ kind: 'contract_error' });
});
