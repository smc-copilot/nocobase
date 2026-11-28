import { describe, expect, it } from 'vitest';

import auth from '../../server/config/auth.js';
import casdoorIdentity from '../../server/config/casdoor-identity.js';

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

describe('Portal Casdoor identity wiring', () => {
  it('leaves browser sign-in off and grants no mapped sets until credentials are complete', () => {
    withCasdoorEnv({}, () => {
      expect(pluginIds()).not.toContain('generic-oauth');
      const identity = casdoorIdentity(runtime);
      expect(identity.browserSignIn).toBe(false);
      expect(identity.mappablePermissionSets).toEqual([]);
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

  it('enables browser sign-in when issuer, client id and secret are set', () => {
    withCasdoorEnv(
      {
        CASDOOR_ISSUER: 'https://sso.example.test',
        CASDOOR_CLIENT_ID: 'portal-client',
        CASDOOR_CLIENT_SECRET: 'portal-secret',
        CASDOOR_AUDIENCE: 'portal-api',
      },
      () => {
        expect(pluginIds()).toContain('generic-oauth');
        expect(casdoorIdentity(runtime)).toMatchObject({
          issuer: 'https://sso.example.test',
          jwksUri: 'https://sso.example.test/.well-known/jwks',
          audience: 'portal-api',
          browserSignIn: true,
          mappablePermissionSets: [],
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
        CASDOOR_CLIENT_ID: 'portal-client',
        CASDOOR_CLIENT_SECRET: 'portal-secret',
      },
      () => {
        expect(casdoorIdentity(runtime)).toMatchObject({
          browserSignIn: false,
          directory: {
            endpoint: 'https://sso.example.test',
            organization: 'built-in',
            clientId: 'portal-client',
            clientSecret: 'portal-secret',
          },
          sync: { enabled: true },
          mappablePermissionSets: [],
        });
      },
    );
  });
});
