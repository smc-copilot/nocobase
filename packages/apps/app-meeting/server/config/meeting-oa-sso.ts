import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface MeetingOaSsoConfig {
  /** When false or unset, the OA login entry and sign-in endpoint stay off. */
  readonly enabled: boolean;
  /**
   * Fixed HTTPS OA session validation URL, including any required query such as
   * `method=getTokenLoginName`. Confirmed during PRE-03 / PRE-04.
   */
  readonly validateUrl?: string;
  /** Exact OA session cookie name. Candidate default is `LtpaToken`. */
  readonly cookieName: string;
  /** Outbound OA call timeout in milliseconds, clamped to 1–30s at use. */
  readonly timeoutMs: number;
  /** Official OA login URL shown when the browser must sign in to OA first. */
  readonly oaLoginUrl?: string;
  /** HTTP method for the validation call. Defaults to GET. */
  readonly validateMethod: 'GET' | 'POST';
  /**
   * When true, allow `http://` validate URLs (intranet only). Prefer sharing
   * `meetingOa.allowInsecureHttp` / `MEETING_OA_ALLOW_INSECURE_HTTP`.
   */
  readonly allowInsecureHttp?: boolean;
}

const meetingOaSso: AppConfigFactory<MeetingOaSsoConfig> = defineAppConfig({
  defaults: {
    enabled: false,
    cookieName: 'LtpaToken',
    timeoutMs: 10_000,
    validateMethod: 'GET',
    allowInsecureHttp: false,
  },
  env: {
    MEETING_OA_SSO_ENABLED: envBoolean('enabled', {
      description:
        'Enable OA Ltpa single sign-on for Meeting. Off by default until Cookie scope and OA validation are confirmed.',
    }),
    MEETING_OA_SSO_VALIDATE_URL: envString('validateUrl', {
      description:
        'Fixed OA session validation URL (for example loginService.do?method=getTokenLoginName). HTTPS by default; http:// needs allowInsecureHttp.',
    }),
    MEETING_OA_SSO_COOKIE_NAME: envString('cookieName', {
      description: 'Exact OA session cookie name expected on Meeting requests.',
    }),
    MEETING_OA_SSO_TIMEOUT_MS: envInteger('timeoutMs', {
      description:
        'OA SSO validation timeout in milliseconds, capped at 30 seconds.',
    }),
    MEETING_OA_SSO_OA_LOGIN_URL: envString('oaLoginUrl', {
      description:
        'Official OA login page URL shown when the employee must sign in to OA first.',
    }),
    MEETING_OA_SSO_VALIDATE_METHOD: envString('validateMethod', {
      description: 'HTTP method for OA session validation: GET or POST.',
    }),
    MEETING_OA_SSO_ALLOW_INSECURE_HTTP: envBoolean('allowInsecureHttp', {
      description:
        'Allow http:// OA SSO validate URLs on the intranet. Also honored when meetingOa.allowInsecureHttp is true.',
    }),
  },
  public: [],
});

export default meetingOaSso;
