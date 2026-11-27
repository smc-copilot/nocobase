#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppCatalogError,
  CATALOG_RELATIVE_PATH,
  readAppCatalog,
  resolveApp,
} from './lib/app-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ appKey?: string, catalogPath?: string, help?: boolean }} */
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--app') {
      options.appKey = argv[++i];
      continue;
    }
    if (arg === '--catalog') {
      options.catalogPath = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-app-engineering.mjs [--app <key>] [--catalog <path>]

Validates deployment/apps.json against the repository:
  - schemaVersion 1 object catalog
  - path safety and packages/apps/app-<key> shape
  - package.json name matches packageName
  - optional --app fails closed for unknown keys (no fallback)

Exit codes: 0 success, 1 validation failure, 2 unexpected error.
`);
}

/**
 * @param {string} repoRoot
 */
async function readRootPackageManager(repoRoot) {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  if (
    typeof packageJson.packageManager !== 'string' ||
    !packageJson.packageManager.startsWith('pnpm@')
  ) {
    throw new AppCatalogError(
      'INVALID_PACKAGE_MANAGER',
      'Root package.json must declare packageManager as pnpm@<version>.',
      { packageManager: packageJson.packageManager },
    );
  }
  return packageJson.packageManager;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const catalog = await readAppCatalog(ROOT, {
    catalogPath: options.catalogPath ?? CATALOG_RELATIVE_PATH,
  });
  const packageManager = await readRootPackageManager(ROOT);
  const apps = Object.keys(catalog.apps).sort();

  if (options.appKey) {
    const resolved = resolveApp(catalog, options.appKey);
    console.log(
      JSON.stringify(
        {
          ok: true,
          packageManager,
          app: resolved,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        packageManager,
        schemaVersion: catalog.schemaVersion,
        apps: apps.map((appKey) => ({
          appKey,
          path: catalog.apps[appKey].path,
          packageName: catalog.apps[appKey].packageName,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof AppCatalogError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          code: error.code,
          message: error.message,
          details: error.details,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 2;
});
