import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AppCatalogError,
  parseAppCatalog,
  readAppCatalog,
  resolveApp,
} from '../../scripts/lib/app-catalog.mjs';

/**
 * @param {Record<string, string | object>} files
 */
function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'app-catalog-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string'
        ? content
        : `${JSON.stringify(content, null, 2)}\n`,
    );
  }
  return root;
}

/**
 * @param {Record<string, string | object>} files
 * @param {(root: string) => Promise<void>} run
 */
async function withFixture(files, run) {
  const root = fixture(files);
  try {
    await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const validCatalog = {
  schemaVersion: 1,
  apps: {
    'enterprise-portal': {
      path: 'packages/apps/app-enterprise-portal',
      packageName: '@superice/app-enterprise-portal',
    },
    meeting: {
      path: 'packages/apps/app-meeting',
      packageName: '@nocobase/app-meeting',
    },
  },
};

test('parseAppCatalog accepts the two registered apps', () => {
  const catalog = parseAppCatalog(validCatalog);
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(Object.keys(catalog.apps).sort(), [
    'enterprise-portal',
    'meeting',
  ]);
});

test('parseAppCatalog rejects unsupported schema versions', () => {
  assert.throws(
    () => parseAppCatalog({ ...validCatalog, schemaVersion: 2 }),
    (error) =>
      error instanceof AppCatalogError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('parseAppCatalog rejects duplicate package names', () => {
  assert.throws(
    () =>
      parseAppCatalog({
        schemaVersion: 1,
        apps: {
          meeting: {
            path: 'packages/apps/app-meeting',
            packageName: '@nocobase/app-meeting',
          },
          other: {
            path: 'packages/apps/app-other',
            packageName: '@nocobase/app-meeting',
          },
        },
      }),
    (error) =>
      error instanceof AppCatalogError &&
      error.code === 'DUPLICATE_PACKAGE_NAME',
  );
});

test('parseAppCatalog rejects path key mismatches that look like traversal', () => {
  assert.throws(
    () =>
      parseAppCatalog({
        schemaVersion: 1,
        apps: {
          meeting: {
            path: 'packages/apps/../apps/app-meeting',
            packageName: '@nocobase/app-meeting',
          },
        },
      }),
    (error) =>
      error instanceof AppCatalogError &&
      (error.code === 'PATH_ESCAPE' || error.code === 'PATH_KEY_MISMATCH'),
  );
});

test('resolveApp fails closed for unknown keys', () => {
  const catalog = parseAppCatalog(validCatalog);
  assert.throws(
    () => resolveApp(catalog, 'expense'),
    (error) =>
      error instanceof AppCatalogError &&
      error.code === 'UNKNOWN_APP' &&
      /Do not fall back/.test(error.message),
  );
  assert.deepEqual(resolveApp(catalog, 'meeting'), {
    appKey: 'meeting',
    path: 'packages/apps/app-meeting',
    packageName: '@nocobase/app-meeting',
  });
});

test('readAppCatalog validates package.json identity against the catalog', async () => {
  await withFixture(
    {
      'deployment/apps.json': validCatalog,
      'packages/apps/app-enterprise-portal/package.json': {
        name: '@superice/app-enterprise-portal',
        version: '0.1.0-beta.0',
      },
      'packages/apps/app-meeting/package.json': {
        name: '@nocobase/app-meeting',
        version: '0.1.0-beta.0',
      },
    },
    async (root) => {
      const catalog = await readAppCatalog(root);
      assert.equal(catalog.apps.meeting.packageName, '@nocobase/app-meeting');
    },
  );
});

test('readAppCatalog fails when an app directory is missing', async () => {
  await withFixture(
    {
      'deployment/apps.json': validCatalog,
      'packages/apps/app-enterprise-portal/package.json': {
        name: '@superice/app-enterprise-portal',
      },
    },
    async (root) => {
      await assert.rejects(
        () => readAppCatalog(root),
        (error) =>
          error instanceof AppCatalogError &&
          error.code === 'APP_PATH_MISSING' &&
          /Merge a source/.test(error.message),
      );
    },
  );
});

test('readAppCatalog fails when package.json name does not match', async () => {
  await withFixture(
    {
      'deployment/apps.json': {
        schemaVersion: 1,
        apps: {
          meeting: {
            path: 'packages/apps/app-meeting',
            packageName: '@nocobase/app-meeting',
          },
        },
      },
      'packages/apps/app-meeting/package.json': {
        name: '@wrong/app-meeting',
      },
    },
    async (root) => {
      await assert.rejects(
        () => readAppCatalog(root),
        (error) =>
          error instanceof AppCatalogError &&
          error.code === 'PACKAGE_NAME_MISMATCH',
      );
    },
  );
});

test('readAppCatalog fails when the catalog file is missing', async () => {
  await withFixture({}, async (root) => {
    await assert.rejects(
      () => readAppCatalog(root),
      (error) =>
        error instanceof AppCatalogError && error.code === 'CATALOG_MISSING',
    );
  });
});

test('repository catalog resolves the two live apps', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const catalog = await readAppCatalog(repoRoot);
  assert.deepEqual(Object.keys(catalog.apps).sort(), [
    'enterprise-portal',
    'meeting',
  ]);
  assert.equal(
    resolveApp(catalog, 'enterprise-portal').packageName,
    '@superice/app-enterprise-portal',
  );
  assert.equal(
    resolveApp(catalog, 'meeting').packageName,
    '@nocobase/app-meeting',
  );
});
