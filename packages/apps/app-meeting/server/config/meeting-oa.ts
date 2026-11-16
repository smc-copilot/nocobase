import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface MeetingOaConfig {
  readonly tokenUrl?: string;
  readonly peopleUrl?: string;
  readonly meetingUrl?: string;
  readonly viewUrl?: string;
  readonly scope?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly timeoutMs: number;
  readonly testAdapter: boolean;
}

const meetingOa: AppConfigFactory<MeetingOaConfig> = defineAppConfig({
  defaults: {
    timeoutMs: 15_000,
    testAdapter: false,
  },
  env: {
    MEETING_OA_TOKEN_URL: envString('tokenUrl', {
      description:
        'OA token endpoint URL. The client sends grant_type and employee_no in both query and form body, with Basic auth.',
    }),
    MEETING_OA_MEETING_URL: envString('meetingUrl', {
      description:
        'OA business write URL. createMeeting, uploadMeetingSummary and createTaskByMeeting are selected with the method query parameter. This is not inferred from the token URL.',
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
  },
  public: [],
});

export default meetingOa;
