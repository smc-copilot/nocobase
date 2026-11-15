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
        'OA token endpoint URL from the operator environment. Request encoding is not in the published anything-llm branch; live token fetch stays blocked until that contract is confirmed.',
    }),
    MEETING_OA_PEOPLE_URL: envString('peopleUrl', {
      description:
        'OA people search URL. Verified from loudon84/anything-llm@codex/meeting-intelligence server/modules/meetings/oaPeople.js as GET with fd_name.',
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
