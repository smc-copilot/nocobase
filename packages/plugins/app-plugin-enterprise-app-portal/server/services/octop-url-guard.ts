import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

import { portalError } from '../errors.js';
import {
  hostAllowed,
  isBlockedIp,
  type DnsLookup,
  type ResolvedAddress,
} from './url-guard.js';

/**
 * Ports that are never an Octop management API. Host allowlisting still decides
 * which names may be called; this only stops the guard from targeting SSH,
 * mail, directory, and datastore ports.
 */
const DENIED_PORTS = new Set([
  22, 23, 25, 53, 110, 143, 445, 3389, 3306, 5432, 6379, 9200, 11211, 27017,
]);

export interface OctopUrlGuardOptions {
  readonly allowHttp?: boolean;
  readonly allowPrivateDns?: boolean;
  /** When set, the effective port must be one of these values. */
  readonly allowedPorts?: readonly number[];
  readonly lookup?: DnsLookup;
}

function reject(message: string, permission = false): never {
  throw portalError(
    permission ? 'PERMISSION_DENIED' : 'INVALID_ARGUMENT',
    'OCTOP_API_URL_NOT_ALLOWED',
    message,
  );
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'http:' ? 80 : 443;
}

/**
 * Validates a server-side Octop management origin. This is not the employee
 * launch URL guard: launch URLs stay on `assertPublicHttpsUrl`.
 * The returned URL has no userinfo, query, or fragment.
 */
export async function assertOctopApiBaseUrl(
  raw: string,
  allowlist: readonly string[],
  options: OctopUrlGuardOptions = {},
): Promise<URL> {
  const allowHttp = options.allowHttp === true;
  const allowPrivateDns = options.allowPrivateDns === true;
  const lookup =
    options.lookup ?? ((hostname) => dnsLookup(hostname, { all: true }));
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.includes('#') ||
    trimmed.includes('@') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:')
  ) {
    reject(
      'Octop API URLs must be absolute http(s) origins without userinfo or fragments.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    reject('The Octop API URL is not a valid absolute URL.');
  }
  const protocolOk =
    parsed.protocol === 'https:' || (allowHttp && parsed.protocol === 'http:');
  if (!protocolOk) {
    reject(
      allowHttp
        ? 'Only HTTP or HTTPS Octop API URLs are accepted.'
        : 'Only HTTPS Octop API URLs are accepted. HTTP requires octopApiAllowHttp.',
    );
  }
  if (parsed.username || parsed.password || parsed.hash) {
    reject('Octop API URLs must not include userinfo or a fragment.');
  }
  if (parsed.search) {
    reject('Octop API URLs must not include a query string.');
  }
  if (!parsed.hostname) {
    reject('Octop API URLs must include a host.');
  }
  if (!hostAllowed(parsed.hostname, allowlist)) {
    reject('The Octop API host is not on the deployment allowlist.', true);
  }
  const port = effectivePort(parsed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    reject('The Octop API port is not allowed.');
  }
  if (DENIED_PORTS.has(port)) {
    reject(`Port ${port} is not allowed for the Octop management API.`);
  }
  if (
    options.allowedPorts &&
    !options.allowedPorts.some((entry) => entry === port)
  ) {
    reject(`Port ${port} is not on the Octop API port allowlist.`);
  }
  await assertAddresses(parsed.hostname, lookup, allowPrivateDns);
  parsed.search = '';
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';
  return parsed;
}

async function assertAddresses(
  hostname: string,
  lookup: DnsLookup,
  allowPrivateDns: boolean,
): Promise<void> {
  if (isIP(hostname)) {
    if (!allowPrivateDns && isBlockedIp(hostname)) {
      reject(
        'The Octop API host is a private, link-local, or metadata address.',
        true,
      );
    }
    return;
  }
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_API_URL_NOT_ALLOWED',
      'The Octop API host could not be resolved.',
    );
  }
  if (addresses.length === 0) {
    reject('The Octop API host did not resolve to an address.', true);
  }
  if (
    !allowPrivateDns &&
    addresses.some((entry) => isBlockedIp(entry.address))
  ) {
    reject(
      'The Octop API host resolves to a private, link-local, or metadata address.',
      true,
    );
  }
}

/** Origin plus path, without a trailing slash, query, or fragment. */
export function formatOctopApiBaseUrl(url: URL): string {
  const copy = new URL(url.toString());
  copy.search = '';
  copy.hash = '';
  copy.username = '';
  copy.password = '';
  return copy.toString().replace(/\/$/u, '');
}
