import { describe, expect, it } from 'vitest';

import auth from '../../server/config/auth.js';
import casdoorIdentity from '../../server/config/casdoor-identity.js';
import serverPlugins from '../../server/plugins.js';

const CASDOOR_KEYS = [
  'CASDOOR_ISSUER',
  'CASDOOR_CLIENT_ID',
  'CASDOOR_CLIENT_SECRET',
  'CASDOOR_AUDIENCE',
  'CASDOOR_JWKS_URI',
  'CASDOOR_ENDPOINT',
  'CASDOOR_ORGANIZATION',
] as const;

const runtime = {} as never;

function withCasdoorEnv(
  values: Partial<Record<(typeof CASDOOR_KEYS)[number], string>>,
  run: () => void,
): void {
  const previous = new Map(
    CASDOOR_KEYS.map((key) => [key, process.env[key]] as const),
  );
  for (const key of CASDOOR_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function pluginIds(): string[] {
  return auth(runtime).plugins.map((plugin) => plugin.id);
}

describe('Meeting Casdoor identity wiring', () => {
  it('registers Casdoor after the scheduler and before foundation', () => {
    const names = serverPlugins.plugins.map((plugin) => plugin.packageName);
    const scheduler = names.indexOf('@nocobase/app-plugin-scheduler');
    const casdoor = names.indexOf('@nocobase/app-plugin-casdoor-identity');
    const foundation = names.indexOf('@nocobase/app-plugin-foundation');
    expect(scheduler).toBeGreaterThanOrEqual(0);
    expect(casdoor).toBeGreaterThan(scheduler);
    expect(foundation).toBeGreaterThan(casdoor);
  });

  it('keeps OA LTPA registered and leaves Casdoor browser sign-in off until credentials are complete', () => {
    withCasdoorEnv({}, () => {
      expect(pluginIds()).toContain('meeting-oa-ltpa');
      expect(pluginIds()).not.toContain('generic-oauth');
      expect(auth(runtime).account?.accountLinking).toEqual({ enabled: false });

      const identity = casdoorIdentity(runtime);
      expect(identity.browserSignIn).toBe(false);
      expect(identity.mappablePermissionSets).toEqual([
        'meeting-operator',
        'meeting-oa-operator',
        'meeting-oa-reconciler',
        'member',
      ]);
      expect(identity.issuer).toBeUndefined();
      expect(identity.directory).toBeUndefined();
      expect(casdoorIdentity.rules?.public).toEqual(['browserSignIn']);
      expect(casdoorIdentity.rules?.env).toEqual(
        expect.objectContaining({
          CASDOOR_ISSUER: expect.anything(),
          CASDOOR_AUDIENCE: expect.anything(),
          CASDOOR_JWKS_URI: expect.anything(),
        }),
      );
    });
  });

  it('adds Casdoor browser OAuth beside OA LTPA when issuer, client id and secret are set', () => {
    withCasdoorEnv(
      {
        CASDOOR_ISSUER: 'https://sso.example.test',
        CASDOOR_CLIENT_ID: 'meeting-client',
        CASDOOR_CLIENT_SECRET: 'meeting-secret',
        CASDOOR_AUDIENCE: 'meeting-api',
      },
      () => {
        const ids = pluginIds();
        expect(ids).toContain('meeting-oa-ltpa');
        expect(ids).toContain('generic-oauth');
        expect(casdoorIdentity(runtime)).toMatchObject({
          issuer: 'https://sso.example.test',
          jwksUri: 'https://sso.example.test/.well-known/jwks',
          audience: 'meeting-api',
          browserSignIn: true,
          mappablePermissionSets: [
            'meeting-operator',
            'meeting-oa-operator',
            'meeting-oa-reconciler',
            'member',
          ],
        });
      },
    );
  });

  it('refuses a partial Casdoor browser credential set', () => {
    withCasdoorEnv({ CASDOOR_ISSUER: 'https://sso.example.test' }, () => {
      expect(() => auth(runtime)).toThrow(/CASDOOR_ISSUER/);
    });
  });

  it('enables directory sync only when endpoint, organization and client credentials are set', () => {
    withCasdoorEnv(
      {
        CASDOOR_ENDPOINT: 'https://sso.example.test',
        CASDOOR_ORGANIZATION: 'built-in',
        CASDOOR_CLIENT_ID: 'meeting-client',
        CASDOOR_CLIENT_SECRET: 'meeting-secret',
      },
      () => {
        expect(casdoorIdentity(runtime)).toMatchObject({
          browserSignIn: false,
          directory: {
            endpoint: 'https://sso.example.test',
            organization: 'built-in',
            clientId: 'meeting-client',
            clientSecret: 'meeting-secret',
          },
          sync: { enabled: true },
        });
      },
    );
  });
});
