import { readFile, realpath, access, constants } from 'node:fs/promises';
import path from 'node:path';

export const CATALOG_RELATIVE_PATH = 'deployment/apps.json';
export const SUPPORTED_SCHEMA_VERSION = 1;

const APP_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const APP_PATH_PATTERN = /^packages\/apps\/app-[a-z][a-z0-9-]*$/;

export class AppCatalogError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppCatalogError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} repoRoot
 * @param {string} relativePath
 */
function assertSafeRelativePath(repoRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new AppCatalogError(
      'PATH_ESCAPE',
      `Application path must be repository-relative; got absolute path "${relativePath}".`,
      { relativePath },
    );
  }
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    normalized !== relativePath ||
    normalized.includes('..') ||
    normalized.startsWith('./') ||
    normalized.includes('/./')
  ) {
    throw new AppCatalogError(
      'PATH_ESCAPE',
      `Application path "${relativePath}" is not a safe repository-relative path.`,
      { relativePath },
    );
  }
  if (!APP_PATH_PATTERN.test(normalized)) {
    throw new AppCatalogError(
      'INVALID_PATH',
      `Application path "${relativePath}" must match packages/apps/app-<key>.`,
      { relativePath },
    );
  }
  const resolved = path.resolve(repoRoot, normalized);
  const rootResolved = path.resolve(repoRoot);
  const relativeToRoot = path.relative(rootResolved, resolved);
  if (
    relativeToRoot.startsWith('..') ||
    path.isAbsolute(relativeToRoot) ||
    relativeToRoot.includes('..')
  ) {
    throw new AppCatalogError(
      'PATH_ESCAPE',
      `Application path "${relativePath}" escapes the repository root.`,
      { relativePath, resolved },
    );
  }
  return { normalized, resolved };
}

/**
 * @param {string} packageName
 */
function assertPackageName(packageName) {
  if (typeof packageName !== 'string' || packageName.trim() === '') {
    throw new AppCatalogError(
      'INVALID_PACKAGE_NAME',
      'packageName must be a non-empty string.',
      { packageName },
    );
  }
  if (packageName !== packageName.trim()) {
    throw new AppCatalogError(
      'INVALID_PACKAGE_NAME',
      `packageName "${packageName}" must not include leading or trailing whitespace.`,
      { packageName },
    );
  }
}

/**
 * @param {unknown} raw
 * @param {{ requireApps?: boolean }} [options]
 */
export function parseAppCatalog(raw, options = {}) {
  const requireApps = options.requireApps !== false;
  if (!isPlainObject(raw)) {
    throw new AppCatalogError(
      'INVALID_CATALOG',
      'Application catalog must be a JSON object.',
    );
  }
  if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new AppCatalogError(
      'UNSUPPORTED_SCHEMA',
      `Unsupported catalog schemaVersion ${JSON.stringify(raw.schemaVersion)}; expected ${SUPPORTED_SCHEMA_VERSION}.`,
      { schemaVersion: raw.schemaVersion },
    );
  }
  if (!isPlainObject(raw.apps)) {
    throw new AppCatalogError(
      'INVALID_CATALOG',
      'Catalog field "apps" must be an object mapping app keys to definitions.',
    );
  }
  const appKeys = Object.keys(raw.apps);
  if (requireApps && appKeys.length === 0) {
    throw new AppCatalogError(
      'EMPTY_CATALOG',
      'Catalog apps mapping is empty; register at least one application.',
    );
  }

  /** @type {Map<string, string>} */
  const packageOwners = new Map();
  /** @type {Record<string, { path: string, packageName: string }>} */
  const apps = {};

  for (const appKey of appKeys.sort()) {
    if (!APP_KEY_PATTERN.test(appKey)) {
      throw new AppCatalogError(
        'INVALID_APP_KEY',
        `App key "${appKey}" must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
        { appKey },
      );
    }
    const entry = raw.apps[appKey];
    if (!isPlainObject(entry)) {
      throw new AppCatalogError(
        'INVALID_APP_ENTRY',
        `Catalog entry for "${appKey}" must be an object.`,
        { appKey },
      );
    }
    if (typeof entry.path !== 'string') {
      throw new AppCatalogError(
        'INVALID_PATH',
        `Catalog entry for "${appKey}" is missing a string path.`,
        { appKey },
      );
    }
    if (typeof entry.packageName !== 'string') {
      throw new AppCatalogError(
        'INVALID_PACKAGE_NAME',
        `Catalog entry for "${appKey}" is missing a string packageName.`,
        { appKey },
      );
    }
    assertPackageName(entry.packageName);
    const expectedPath = `packages/apps/app-${appKey}`;
    if (entry.path.replaceAll('\\', '/') !== expectedPath) {
      throw new AppCatalogError(
        'PATH_KEY_MISMATCH',
        `Catalog entry for "${appKey}" path must be "${expectedPath}", got "${entry.path}".`,
        { appKey, path: entry.path, expectedPath },
      );
    }
    const owner = packageOwners.get(entry.packageName);
    if (owner !== undefined) {
      throw new AppCatalogError(
        'DUPLICATE_PACKAGE_NAME',
        `packageName "${entry.packageName}" is claimed by both "${owner}" and "${appKey}".`,
        { packageName: entry.packageName, appKeys: [owner, appKey] },
      );
    }
    packageOwners.set(entry.packageName, appKey);
    apps[appKey] = {
      path: entry.path.replaceAll('\\', '/'),
      packageName: entry.packageName,
    };
  }

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    apps,
  };
}

/**
 * @param {string} repoRoot
 * @param {{ catalogPath?: string }} [options]
 */
export async function readAppCatalog(repoRoot, options = {}) {
  const catalogRelative = options.catalogPath ?? CATALOG_RELATIVE_PATH;
  const catalogAbsolute = path.resolve(repoRoot, catalogRelative);
  let text;
  try {
    text = await readFile(catalogAbsolute, 'utf8');
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    if (code === 'ENOENT') {
      throw new AppCatalogError(
        'CATALOG_MISSING',
        `Application catalog not found at ${catalogRelative}. Create deployment/apps.json before selecting a business app to build or install.`,
        { catalogPath: catalogRelative },
      );
    }
    throw error;
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new AppCatalogError(
      'INVALID_JSON',
      `Application catalog ${catalogRelative} is not valid JSON: ${/** @type {Error} */ (error).message}`,
      { catalogPath: catalogRelative },
    );
  }

  const catalog = parseAppCatalog(raw);
  const rootReal = await realpath(repoRoot).catch(() => path.resolve(repoRoot));

  for (const [appKey, entry] of Object.entries(catalog.apps)) {
    const { normalized, resolved } = assertSafeRelativePath(repoRoot, entry.path);
    entry.path = normalized;

    try {
      await access(resolved, constants.F_OK);
    } catch {
      throw new AppCatalogError(
        'APP_PATH_MISSING',
        `Application "${appKey}" path "${normalized}" does not exist. Merge a source that contains this app, or choose a catalog ref that includes it.`,
        { appKey, path: normalized },
      );
    }

    const real = await realpath(resolved).catch(() => resolved);
    const relativeToRoot = path.relative(rootReal, real);
    if (
      relativeToRoot.startsWith('..') ||
      path.isAbsolute(relativeToRoot) ||
      relativeToRoot.includes('..')
    ) {
      throw new AppCatalogError(
        'PATH_ESCAPE',
        `Application "${appKey}" path resolves outside the repository root.`,
        { appKey, path: normalized, resolved: real },
      );
    }

    const packageJsonPath = path.join(resolved, 'package.json');
    let packageJsonText;
    try {
      packageJsonText = await readFile(packageJsonPath, 'utf8');
    } catch {
      throw new AppCatalogError(
        'PACKAGE_JSON_MISSING',
        `Application "${appKey}" is missing package.json at ${path.posix.join(normalized, 'package.json')}.`,
        { appKey, path: normalized },
      );
    }
    let packageJson;
    try {
      packageJson = JSON.parse(packageJsonText);
    } catch (error) {
      throw new AppCatalogError(
        'INVALID_PACKAGE_JSON',
        `Application "${appKey}" package.json is not valid JSON: ${/** @type {Error} */ (error).message}`,
        { appKey, path: normalized },
      );
    }
    if (packageJson?.name !== entry.packageName) {
      throw new AppCatalogError(
        'PACKAGE_NAME_MISMATCH',
        `Application "${appKey}" catalog packageName is "${entry.packageName}" but package.json name is ${JSON.stringify(packageJson?.name)}.`,
        {
          appKey,
          catalogPackageName: entry.packageName,
          actualPackageName: packageJson?.name,
        },
      );
    }
  }

  return catalog;
}

/**
 * @param {{ schemaVersion: number, apps: Record<string, { path: string, packageName: string }> }} catalog
 * @param {string} appKey
 */
export function resolveApp(catalog, appKey) {
  if (typeof appKey !== 'string' || appKey.trim() === '') {
    throw new AppCatalogError(
      'INVALID_APP_KEY',
      'appKey must be a non-empty string.',
      { appKey },
    );
  }
  const entry = catalog.apps[appKey];
  if (!entry) {
    const known = Object.keys(catalog.apps).sort().join(', ') || '(none)';
    throw new AppCatalogError(
      'UNKNOWN_APP',
      `Unknown application key "${appKey}". Known keys: ${known}. Do not fall back to another app or a default package.`,
      { appKey, knownApps: Object.keys(catalog.apps).sort() },
    );
  }
  return {
    appKey,
    path: entry.path,
    packageName: entry.packageName,
  };
}

/**
 * @param {string} repoRoot
 * @param {string} appKey
 * @param {{ catalogPath?: string }} [options]
 */
export async function resolveAppFromRepo(repoRoot, appKey, options = {}) {
  const catalog = await readAppCatalog(repoRoot, options);
  return resolveApp(catalog, appKey);
}
