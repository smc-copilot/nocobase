import { isIP } from 'node:net';

export function isUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  )
    return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (ipVersion === 6) return true;
  return false;
}

export function validateHttpsOrigin(origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('CONFIG_INVALID');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    isUnsafeHost(parsed.hostname)
  ) {
    throw new Error('CONFIG_INVALID');
  }
  return parsed.origin;
}

export function normalizeOriginAllowlist(
  originAllowlist: readonly string[],
): Set<string> {
  if (!Array.isArray(originAllowlist) || originAllowlist.length === 0) {
    throw new Error('CONFIG_INVALID');
  }
  return new Set(originAllowlist.map(validateHttpsOrigin));
}

export function resolveConfiguredOrigin(
  origin: string | undefined,
  originAllowlist: readonly string[],
): string {
  const trusted = normalizeOriginAllowlist(originAllowlist);
  const configured = origin ? validateHttpsOrigin(origin) : null;
  if (!configured || !trusted.has(configured)) {
    throw new Error('CONFIG_INVALID');
  }
  return configured;
}
