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

export interface GatewayAdminSettings {
  readonly enabled?: boolean | null;
  readonly origin?: string | null;
  readonly resource?: string | null;
  readonly instanceId?: string | null;
  readonly allowedOrigin?: string | null;
  readonly contractRevision?: string | null;
  readonly contractSha256?: string | null;
  readonly bridgeHmacKey?: string | null;
  readonly bridgeKeyringJson?: string | null;
}

/**
 * Gateway connection material is environment / config.yml only.
 * DB-saved administrator overrides are ignored (settings page form removed).
 */
export function gatewayConfigWithSettings<
  T extends {
    enabled: boolean;
    origin?: string;
    originAllowlist: readonly string[];
    resource?: string;
    instanceId?: string;
    allowedOrigin?: string;
    contractRevision?: string;
    contractSha256?: string;
    bridgeHmacKey?: string;
    bridgeKeyringJson?: string;
  },
>(config: T, _settings?: GatewayAdminSettings | null): T {
  void _settings;
  return config;
}

/** A saved administrator origin is the connection address. It is added to the allowlist and wins over the environment. */
export function gatewayConfigWithOrigin<
  T extends { origin?: string; originAllowlist: readonly string[] },
>(config: T, savedOrigin: string | null | undefined): T {
  const saved = savedOrigin?.trim();
  if (!saved) return config;
  const origin = validateHttpsOrigin(saved);
  return {
    ...config,
    origin,
    originAllowlist: [
      origin,
      ...config.originAllowlist.filter((item) => item !== origin),
    ],
  };
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
