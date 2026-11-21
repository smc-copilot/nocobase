import type { MeetingGatewayConfig } from '../../config/meeting-gateway.js';

const HEX_64 = /^[0-9a-f]{64}$/i;

export interface GatewayContractConfig {
  readonly enabled?: boolean;
  readonly origin?: string;
  readonly resource?: string;
  readonly instanceId?: string;
  readonly allowedOrigin?: string;
  readonly contractRevision?: string;
  readonly contractSha256?: string;
  readonly bridgeHmacKey?: string;
  readonly bridgeKeyringJson?: string;
}

const REQUIRED: readonly (keyof GatewayContractConfig)[] = [
  'enabled',
  'origin',
  'resource',
  'instanceId',
  'allowedOrigin',
  'contractRevision',
  'contractSha256',
  'bridgeHmacKey',
  'bridgeKeyringJson',
];

const ENV_NAME: Record<(typeof REQUIRED)[number], string> = {
  enabled: 'MEETING_GATEWAY_ENABLED',
  origin: 'MEETING_GATEWAY_ORIGIN',
  resource: 'MEETING_GATEWAY_REST_RESOURCE',
  instanceId: 'MEETING_GATEWAY_INSTANCE_ID',
  allowedOrigin: 'MEETING_GATEWAY_ALLOWED_ORIGIN',
  contractRevision: 'MEETING_GATEWAY_CONTRACT_REVISION',
  contractSha256: 'MEETING_GATEWAY_CONTRACT_SHA256',
  bridgeHmacKey: 'MEETING_GATEWAY_BRIDGE_HMAC_KEY',
  bridgeKeyringJson: 'MEETING_GATEWAY_BRIDGE_KEYRING_JSON',
};

function keyringReady(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return false;
  const activeKeyId = (parsed as { activeKeyId?: unknown }).activeKeyId;
  const keys = (parsed as { keys?: unknown }).keys;
  if (typeof activeKeyId !== 'string' || !keys || typeof keys !== 'object')
    return false;
  const material = (keys as Record<string, unknown>)[activeKeyId];
  return typeof material === 'string' && HEX_64.test(material);
}

export function missingGatewayContract(
  config: GatewayContractConfig,
): readonly string[] {
  return REQUIRED.filter((key) => {
    if (key === 'enabled') return config.enabled !== true;
    if (key === 'contractSha256' || key === 'bridgeHmacKey')
      return !HEX_64.test(config[key] ?? '');
    if (key === 'bridgeKeyringJson')
      return !keyringReady(config.bridgeKeyringJson);
    return !config[key]?.trim();
  }).map((key) => ENV_NAME[key]);
}

export function isGatewayContractReady(config: GatewayContractConfig): boolean {
  return missingGatewayContract(config).length === 0;
}

export function continueTo(
  allowedOrigin: string,
  flowNonce: string,
  options: { allowInsecureHttp?: boolean } = {},
): string {
  const origin = new URL(allowedOrigin);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !['https:', 'http:'].includes(origin.protocol)
  ) {
    throw new Error('CONFIG_INVALID');
  }
  const loopback =
    origin.hostname === '127.0.0.1' || origin.hostname === 'localhost';
  if (
    origin.protocol !== 'https:' &&
    !loopback &&
    options.allowInsecureHttp !== true
  ) {
    throw new Error('CONFIG_INVALID');
  }
  const target = new URL('/meetings/done', origin.origin);
  target.searchParams.set('flow_nonce', flowNonce);
  return target.toString();
}

export type { MeetingGatewayConfig };
