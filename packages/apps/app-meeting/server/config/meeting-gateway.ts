import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface MeetingGatewayConfig {
  readonly origin?: string;
  readonly originAllowlist: readonly string[];
  readonly applicationId?: string;
  readonly expectedApplicationId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly resource?: string;
  readonly scopes: readonly string[];
  readonly publicBaseUrl?: string;
  readonly tencentCorpId?: string;
  readonly tencentSdkId?: string;
  readonly callbackRef?: string;
  readonly authorizationPathAllowlist: readonly string[];
  readonly timeoutMs: number;
  readonly queryMaxDays: number;
  readonly oauthStateTtlMs: number;
  readonly instanceId?: string;
  readonly testAdapter: boolean;
}

const meetingGateway: AppConfigFactory<MeetingGatewayConfig> = defineAppConfig({
  defaults: {
    originAllowlist: [],
    scopes: [],
    authorizationPathAllowlist: [],
    timeoutMs: 15_000,
    queryMaxDays: 93,
    oauthStateTtlMs: 300_000,
    testAdapter: false,
  },
  env: {
    MEETING_GATEWAY_ORIGIN: envString('origin', {
      description:
        'Allowlisted HTTPS origin of the meeting gateway. Arbitrary request URLs are rejected.',
    }),
    MEETING_GATEWAY_ORIGIN_ALLOWLIST: envStrings('originAllowlist', ',', {
      description:
        'Comma-separated HTTPS origins the application may call. The origin must be in this list.',
    }),
    MEETING_GATEWAY_APPLICATION_ID: envString('applicationId', {
      description: 'Gateway OAuth application_id for this Meeting App.',
    }),
    MEETING_GATEWAY_EXPECTED_APPLICATION_ID: envString(
      'expectedApplicationId',
      {
        description:
          'Expected application_id on listed connections. Defaults to applicationId.',
      },
    ),
    MEETING_GATEWAY_CLIENT_ID: envString('clientId', {
      description: 'Gateway OAuth client_id used only on the server.',
    }),
    MEETING_GATEWAY_CLIENT_SECRET: envString('clientSecret', {
      description: 'Gateway OAuth client_secret. Never returned to the page.',
      secret: true,
    }),
    MEETING_GATEWAY_RESOURCE: envString('resource', {
      description: 'Token resource the gateway exchange must return unchanged.',
    }),
    MEETING_GATEWAY_SCOPES: envStrings('scopes', ' ', {
      description: 'Space-separated gateway OAuth scopes.',
    }),
    MEETING_GATEWAY_PUBLIC_BASE_URL: envString('publicBaseUrl', {
      description:
        'Public HTTPS origin of this App, used when composing the OAuth return path.',
    }),
    MEETING_GATEWAY_TENCENT_CORP_ID: envString('tencentCorpId', {
      description: 'corp_id the gateway authorization URL must carry.',
    }),
    MEETING_GATEWAY_TENCENT_SDK_ID: envString('tencentSdkId', {
      description: 'sdk_id the gateway authorization URL must carry.',
    }),
    MEETING_GATEWAY_CALLBACK_REF: envString('callbackRef', {
      description: 'Gateway callback ref used to validate authorization URLs.',
    }),
    MEETING_GATEWAY_AUTHORIZATION_PATH_ALLOWLIST: envStrings(
      'authorizationPathAllowlist',
      ',',
      {
        description:
          'Comma-separated Tencent OAuth pathnames allowed on authorization_url, from the published oauth.js contract.',
      },
    ),
    MEETING_GATEWAY_TIMEOUT_MS: envInteger('timeoutMs', {
      description:
        'Gateway HTTP timeout in milliseconds, capped at 30 seconds.',
    }),
    MEETING_GATEWAY_QUERY_MAX_DAYS: envInteger('queryMaxDays', {
      description: 'Maximum inclusive day span of one meeting query window.',
    }),
    MEETING_GATEWAY_OAUTH_STATE_TTL_MS: envInteger('oauthStateTtlMs', {
      description: 'Local OAuth state time-to-live in milliseconds.',
    }),
    MEETING_GATEWAY_INSTANCE_ID: envString('instanceId', {
      description:
        'Stable gateway instance id stored on meeting source keys for this deployment.',
    }),
    MEETING_GATEWAY_TEST_ADAPTER: envBoolean('testAdapter', {
      description:
        'Isolation tests only: use the in-process gateway adapter. Never enable in a real environment.',
    }),
  },
  public: [],
});

export default meetingGateway;
