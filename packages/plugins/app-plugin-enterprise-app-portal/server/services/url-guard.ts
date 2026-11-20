import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

import { portalError } from '../errors.js';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

export type DnsLookup = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

const BLOCKED_V4 = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['224.0.0.0', '255.255.255.255'],
] as const;

function ipv4ToInt(address: string): number {
  return (
    address
      .split('.')
      .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
  );
}

function isBlockedV4(address: string): boolean {
  const value = ipv4ToInt(address);
  return BLOCKED_V4.some(
    ([start, end]) => value >= ipv4ToInt(start) && value <= ipv4ToInt(end),
  );
}

function isBlockedV6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('ff')
  );
}

export function isBlockedIp(address: string): boolean {
  if (address.startsWith('::ffff:')) {
    return isBlockedV4(address.slice('::ffff:'.length));
  }
  const version = isIP(address);
  if (version === 4) return isBlockedV4(address);
  if (version === 6) return isBlockedV6(address);
  return true;
}

export function hostAllowed(
  hostname: string,
  allowlist: readonly string[],
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  return allowlist.some((entry) => {
    const allowed = entry.toLowerCase().replace(/\.$/u, '');
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

export function parseRelativeTargetPath(
  targetPath: string | undefined,
): string {
  const raw = (targetPath ?? '/').trim() || '/';
  if (
    raw.startsWith('//') ||
    raw.includes('\\') ||
    raw.includes('://') ||
    raw.toLowerCase().startsWith('javascript:') ||
    raw.toLowerCase().startsWith('data:')
  ) {
    throw portalError(
      'INVALID_ARGUMENT',
      'INVALID_TARGET_PATH',
      'targetPath must be a same-origin relative path.',
    );
  }
  if (!raw.startsWith('/')) {
    throw portalError(
      'INVALID_ARGUMENT',
      'INVALID_TARGET_PATH',
      'targetPath must start with /.',
    );
  }
  return raw;
}

export async function assertPublicHttpsUrl(
  raw: string,
  allowlist: readonly string[],
  lookup: DnsLookup = (hostname) => dnsLookup(hostname, { all: true }),
): Promise<URL> {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:')
  ) {
    throw portalError(
      'INVALID_ARGUMENT',
      'URL_NOT_ALLOWED',
      'Only absolute HTTPS URLs on the deployment allowlist are accepted.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw portalError(
      'INVALID_ARGUMENT',
      'URL_NOT_ALLOWED',
      'The URL is not a valid absolute HTTPS address.',
    );
  }
  if (parsed.protocol !== 'https:') {
    throw portalError(
      'INVALID_ARGUMENT',
      'URL_NOT_ALLOWED',
      'Only HTTPS URLs are accepted.',
    );
  }
  if (parsed.username || parsed.password) {
    throw portalError(
      'INVALID_ARGUMENT',
      'URL_NOT_ALLOWED',
      'URLs must not include user information.',
    );
  }
  if (!parsed.hostname || isIP(parsed.hostname)) {
    throw portalError(
      'INVALID_ARGUMENT',
      'URL_NOT_ALLOWED',
      'Literal IP addresses are not accepted.',
    );
  }
  if (!hostAllowed(parsed.hostname, allowlist)) {
    throw portalError(
      'PERMISSION_DENIED',
      'HOST_NOT_ALLOWLISTED',
      'The host is not on the deployment launch allowlist.',
    );
  }
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await lookup(parsed.hostname);
  } catch {
    throw portalError(
      'FAILED_PRECONDITION',
      'URL_DNS_FAILED',
      'The host could not be resolved.',
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isBlockedIp(entry.address))
  ) {
    throw portalError(
      'PERMISSION_DENIED',
      'URL_RESOLVES_PRIVATE',
      'The host resolves to a private or link-local address.',
    );
  }
  return parsed;
}

export function composeLaunchUrl(baseUrl: string, targetPath: string): string {
  const path = parseRelativeTargetPath(targetPath);
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  // `/` means the catalog base URL itself; any other path is origin-relative.
  if (path === '/') return new URL(base).toString();
  return new URL(path, base).toString();
}
