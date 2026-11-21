import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Docker prebuilt context', () => {
  it('re-includes this application dist for a repository-root DIST=prebuilt build', async () => {
    const ignore = await readFile(
      new URL('../../Dockerfile.dockerignore', import.meta.url),
      'utf8',
    );
    expect(ignore).toMatch(/^packages\/\*\/\*\/dist$/m);
    expect(ignore).toMatch(/^!packages\/apps\/\*\/dist$/m);
    expect(ignore).toMatch(/^!packages\/apps\/\*\/dist\/\*\*$/m);
    expect(ignore).toMatch(/^packages\/apps\/\*\/dist\/\.env$/m);
  });

  it('documents the repository-root APP_DIR for this application', async () => {
    const dockerfile = await readFile(
      new URL('../../Dockerfile', import.meta.url),
      'utf8',
    );
    expect(dockerfile).toContain(
      'docker build -f packages/apps/app-meeting/Dockerfile',
    );
    expect(dockerfile).toContain(
      '--build-arg APP_DIR=packages/apps/app-meeting',
    );
    expect(dockerfile).toContain('--exclude=packages/apps/*/dist');
  });
});
