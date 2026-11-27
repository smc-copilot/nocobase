import type { MeetingGatewayConfig } from '../../config/meeting-gateway.js';
import { MeetingGatewayError } from './errors.js';
import { resolveConfiguredOrigin } from './origin.js';

export interface TencentAuthorizationConfig {
  readonly applicationId: string;
  readonly expectedApplicationId: string;
  readonly callbackRef: string;
  readonly corpId: string;
  readonly sdkId: string;
  readonly callbackUri: string;
  readonly returnTo: string;
}

function requireToken(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new MeetingGatewayError(
      'GATEWAY_NOT_CONFIGURED',
      `Meeting gateway ${label} is not configured.`,
      'FAILED_PRECONDITION',
    );
  }
  return value.trim();
}

export function tencentCallbackUri(
  origin: string,
  callbackRef: string,
): string {
  return `${origin.replace(/\/$/, '')}/callbacks/tencent/oauth/${encodeURIComponent(callbackRef)}`;
}

export function resolveTencentAuthorizationConfig(
  config: MeetingGatewayConfig,
  returnTo: string,
): TencentAuthorizationConfig {
  const origin = resolveConfiguredOrigin(config.origin, config.originAllowlist);
  const applicationId = requireToken(config.applicationId, 'applicationId');
  const expectedApplicationId = (
    config.expectedApplicationId ?? applicationId
  ).trim();
  const callbackRef = requireToken(config.callbackRef, 'callbackRef');
  const corpId = requireToken(config.tencentCorpId, 'tencentCorpId');
  const sdkId = requireToken(config.tencentSdkId, 'tencentSdkId');
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(callbackRef) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(expectedApplicationId) ||
    (applicationId && expectedApplicationId !== applicationId)
  ) {
    throw new MeetingGatewayError(
      'GATEWAY_NOT_CONFIGURED',
      'Meeting gateway OAuth application identifiers are invalid.',
      'FAILED_PRECONDITION',
    );
  }
  let callback: URL;
  let consumerReturn: URL;
  try {
    callback = new URL(tencentCallbackUri(origin, callbackRef));
    consumerReturn = new URL(returnTo);
  } catch {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'The OAuth callback or return URL is not a valid URL.',
      'UNAVAILABLE',
    );
  }
  if (
    callback.protocol !== 'https:' ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash ||
    callback.pathname !==
      `/callbacks/tencent/oauth/${encodeURIComponent(callbackRef)}` ||
    !['https:', 'http:'].includes(consumerReturn.protocol) ||
    consumerReturn.username ||
    consumerReturn.password
  ) {
    throw new MeetingGatewayError(
      'GATEWAY_NOT_CONFIGURED',
      'The OAuth callback URL does not match the published Tencent contract.',
      'FAILED_PRECONDITION',
    );
  }
  return {
    applicationId,
    expectedApplicationId,
    callbackRef,
    corpId,
    sdkId,
    callbackUri: callback.href,
    returnTo,
  };
}

const MARKETPLACE_AUTHORIZE_PATH = '/marketplace/authorize.html';
const MARKETPLACE_QUERY_KEYS = [
  'corp_id',
  'sdk_id',
  'redirect_uri',
  'state',
] as const;

/**
 * Shape check for the Tencent marketplace authorize URL.
 * Corp and SDK values are not compared with local config.
 */
export function assertTencentMarketplaceAuthorizationUrl(
  value: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'startAuthorization returned an authorization_url that is not a URL.',
      'UNAVAILABLE',
    );
  }
  const keys = Array.from(url.searchParams.keys());
  const allowed = new Set<string>(MARKETPLACE_QUERY_KEYS);
  const present = MARKETPLACE_QUERY_KEYS.every((key) => {
    const values = url.searchParams.getAll(key);
    return values.length === 1 && Boolean(values[0]?.trim());
  });
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'meeting.tencent.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== MARKETPLACE_AUTHORIZE_PATH ||
    keys.length !== MARKETPLACE_QUERY_KEYS.length ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !allowed.has(key)) ||
    !present
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'startAuthorization returned an authorization_url that is not the Tencent marketplace authorize URL.',
      'UNAVAILABLE',
    );
  }
  return value;
}

export function validateAuthorizationUrl(
  value: string,
  options: {
    allowedPaths: readonly string[];
    config: TencentAuthorizationConfig;
  },
): string {
  if (
    !Array.isArray(options.allowedPaths) ||
    options.allowedPaths.length === 0
  ) {
    throw new MeetingGatewayError(
      'GATEWAY_NOT_CONFIGURED',
      'Meeting gateway authorization path allowlist is not configured.',
      'FAILED_PRECONDITION',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'startAuthorization returned an authorization_url that is not a URL.',
      'UNAVAILABLE',
    );
  }
  const queryEntries = Array.from(url.searchParams.entries());
  const queryKeys = queryEntries.map(([key]) => key);
  const allowedQueryKeys = new Set([
    'corp_id',
    'sdk_id',
    'redirect_uri',
    'state',
  ]);
  const corps = url.searchParams.getAll('corp_id');
  const states = url.searchParams.getAll('state');
  const sdkIds = url.searchParams.getAll('sdk_id');
  const redirectUris = url.searchParams.getAll('redirect_uri');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'meeting.tencent.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !options.allowedPaths.includes(url.pathname) ||
    queryEntries.length !== 4 ||
    queryKeys.some((key) => !allowedQueryKeys.has(key)) ||
    states.length !== 1 ||
    !states[0]?.trim() ||
    corps.length !== 1 ||
    corps[0] !== options.config.corpId ||
    sdkIds.length !== 1 ||
    sdkIds[0] !== options.config.sdkId ||
    redirectUris.length !== 1 ||
    redirectUris[0] !== options.config.callbackUri
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'startAuthorization returned an authorization_url that failed the published Tencent checks.',
      'UNAVAILABLE',
    );
  }
  return value;
}
