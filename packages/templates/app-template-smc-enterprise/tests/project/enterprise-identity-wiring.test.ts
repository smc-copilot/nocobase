import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

function read(relative: string): string {
  return readFileSync(path.join(appRoot, relative), 'utf8');
}

function pluginEntries(source: string, factory: string): string[] {
  const match = source.match(new RegExp(`${factory}\\(\\[([\\s\\S]*?)\\]\\)`));
  expect(match, `${factory}([...])`).not.toBeNull();
  return match![1]
    .split('\n')
    .map((line) =>
      line
        .replace(/\/\/.*$/u, '')
        .trim()
        .replace(/,$/u, ''),
    )
    .filter((line) => line.length > 0);
}

describe('enterprise identity template wiring', () => {
  it('depends on the Casdoor identity plugin', () => {
    const manifest = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(
      manifest.dependencies?.['@nocobase/app-plugin-casdoor-identity'],
    ).toBe('workspace:*');
  });

  it('registers the Casdoor identity server plugin', () => {
    const source = read('server/plugins.ts');
    expect(source).toContain(
      "import casdoorIdentity from '@nocobase/app-plugin-casdoor-identity/server';",
    );
    expect(pluginEntries(source, 'defineServerPlugins')).toContain(
      'casdoorIdentity',
    );
  });

  it('publishes directory sync and browser sign-in from casdoor identity config', () => {
    const source = read('server/config/casdoor-identity.ts');
    expect(source).toContain('function readDirectory()');
    expect(source).toContain('CASDOOR_ENDPOINT');
    expect(source).toContain('CASDOOR_ORGANIZATION');
    expect(source).toContain('browserSignIn');
    expect(source).toContain('directory');
    expect(source).toMatch(/sync:\s*\{\s*enabled:\s*true\s*\}/u);
    expect(source).toMatch(/public:\s*\[[^\]]*['"]browserSignIn['"]/u);
    expect(source).toContain('CASDOOR_ISSUER');
    expect(source).toContain('CASDOOR_AUDIENCE');
    expect(source).toContain('CASDOOR_JWKS_URI');
  });

  it('registers casdoor identity config with the application', () => {
    const source = read('server/config/index.ts');
    expect(source).toContain(
      "import casdoorIdentity from './casdoor-identity.js';",
    );
    expect(source).toMatch(/casdoorIdentity,/u);
  });

  it('builds browser OAuth from createCasdoorBrowserOAuthConfig', () => {
    const source = read('server/config/auth.ts');
    expect(source).toContain(
      "import { createCasdoorBrowserOAuthConfig } from '@nocobase/app-plugin-casdoor-identity/server';",
    );
    expect(source).toContain('genericOAuth({');
    expect(source).toContain('createCasdoorBrowserOAuthConfig({');
  });

  it('exposes the Casdoor public config and a login button', () => {
    const publicConfig = read('client/casdoor-public-config.ts');
    expect(publicConfig).toContain('casdoorIdentity');
    expect(publicConfig).toContain('browserSignIn?: boolean');

    const login = read('client/pages/auth/login.tsx');
    expect(login).toContain("import '../../casdoor-public-config.js';");
    expect(login).toContain("'casdoorIdentity.browserSignIn'");
    expect(login).toContain("provider: 'casdoor'");
    expect(login).toMatch(/id:\s*'casdoor'/u);
    expect(login).toContain('signInWithCasdoor');
  });

  it('registers Foundation with no options', () => {
    const clientPlugins = read('client/plugins.ts');
    const calls = [...clientPlugins.matchAll(/\bfoundation\s*\(([^)]*)\)/gu)];
    expect(calls.map((match) => match[1].trim())).toEqual(['']);
    expect(pluginEntries(clientPlugins, 'defineClientPlugins')).toContain(
      'foundation()',
    );

    const serverPlugins = read('server/plugins.ts');
    expect(pluginEntries(serverPlugins, 'defineServerPlugins')).toContain(
      'foundation',
    );
  });
});
