import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface MeetingOaConfig {
  /**
   * OA MeetingApi.do URL for business writes (createMeeting / upload / tasks).
   * Does not supply the OAuth token endpoint.
   */
  readonly baseApiUrl?: string;
  /**
   * OA oauth.do URL for client_credentials token (method=token). Preferred over
   * `tokenUrl` when set.
   */
  readonly oauthUrl?: string;
  readonly tokenUrl?: string;
  readonly peopleUrl?: string;
  readonly meetingUrl?: string;
  readonly viewUrl?: string;
  readonly scope?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly timeoutMs: number;
  readonly testAdapter: boolean;
  /**
   * When true, allow `http:` OA endpoints (corporate intranet). Default false:
   * only HTTPS, or HTTP loopback when `testAdapter` is on.
   */
  readonly allowInsecureHttp?: boolean;
}

/**
 * Token comes from oauth.do / tokenUrl only. Meeting writes use meetingUrl or
 * baseApiUrl — baseApiUrl never fills tokenUrl.
 */
export function resolveMeetingOaApiUrls(config: MeetingOaConfig): {
  tokenUrl?: string;
  meetingUrl?: string;
} {
  const oauth = config.oauthUrl?.trim() || undefined;
  const token = config.tokenUrl?.trim() || undefined;
  const meeting = config.meetingUrl?.trim() || undefined;
  const base = config.baseApiUrl?.trim() || undefined;
  return {
    tokenUrl: oauth || token,
    meetingUrl: meeting || base,
  };
}

const meetingOa: AppConfigFactory<MeetingOaConfig> = defineAppConfig({
  defaults: {
    timeoutMs: 15_000,
    testAdapter: false,
    allowInsecureHttp: false,
  },
  env: {
    MEETING_OA_BASE_API_URL: envString('baseApiUrl', {
      description:
        'OA MeetingApi.do URL for business writes (method=createMeeting|…). Not used as the OAuth token URL.',
    }),
    MEETING_OA_OAUTH_URL: envString('oauthUrl', {
      description:
        'OA oauth.do URL for client_credentials token (method=token, employee_no, Basic auth). Preferred over MEETING_OA_TOKEN_URL.',
    }),
    MEETING_OA_TOKEN_URL: envString('tokenUrl', {
      description:
        'Optional OA token endpoint when MEETING_OA_OAUTH_URL is unset. Sends grant_type and employee_no in query and form body with Basic auth.',
    }),
    MEETING_OA_MEETING_URL: envString('meetingUrl', {
      description:
        'Optional override for OA business writes. Defaults to MEETING_OA_BASE_API_URL. createMeeting, uploadMeetingSummary and createTaskByMeeting use the method query parameter.',
    }),
    MEETING_OA_VIEW_URL: envString('viewUrl', {
      description:
        'Optional OA meeting view URL template. May include {meetingId}.',
    }),
    MEETING_OA_SCOPE: envString('scope', {
      description: 'Optional OA token scope sent in query and form body.',
    }),
    MEETING_OA_PEOPLE_URL: envString('peopleUrl', {
      description:
        'OA people search URL. GET with fd_name, matching loudon84/anything-llm oaPeople.js.',
    }),
    MEETING_OA_CLIENT_ID: envString('clientId', {
      description: 'OA client_id used only on the server.',
    }),
    MEETING_OA_CLIENT_SECRET: envString('clientSecret', {
      description: 'OA client_secret. Never returned to the page.',
      secret: true,
    }),
    MEETING_OA_TIMEOUT_MS: envInteger('timeoutMs', {
      description: 'OA HTTP timeout in milliseconds, capped at 30 seconds.',
    }),
    MEETING_OA_TEST_ADAPTER: envBoolean('testAdapter', {
      description:
        'Isolation tests only: use the in-process OA adapter. Never enable in a real environment.',
    }),
    MEETING_OA_ALLOW_INSECURE_HTTP: envBoolean('allowInsecureHttp', {
      description:
        'Allow http:// OA token, people and meeting URLs (intranet only). Prefer HTTPS in production.',
    }),
  },
  public: [],
});

export default meetingOa;
