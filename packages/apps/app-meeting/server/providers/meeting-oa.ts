import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import type { MeetingOaConfig } from '../config/meeting-oa.js';
import { createHttpMeetingOaAdapter } from '../meetings/oa/http-adapter.js';
import {
  createMeetingOaSecretsStores,
  oaSettingsAad,
} from '../meetings/oa/secrets.js';
import { TestMeetingOaAdapter } from '../meetings/oa/test-adapter.js';
import { meetingOaAdapterToken } from '../meetings/oa/token.js';
import {
  MEETING_OA_SETTINGS,
  OA_SECRET_PURPOSE,
  type MeetingOaSettings,
} from '../meetings/resources.js';

export default class MeetingOaProvider extends ServiceProvider<Application> {
  readonly name = 'app/meeting-oa';

  public override register(): void {
    const config =
      this.app.config.get<MeetingOaConfig>('meetingOa') ??
      ({ timeoutMs: 15_000, testAdapter: false } satisfies MeetingOaConfig);
    this.app.container.singleton(meetingOaAdapterToken, () =>
      config.testAdapter
        ? new TestMeetingOaAdapter()
        : createHttpMeetingOaAdapter({
            config,
            resolvePeopleUrl: async () => {
              const row = await this.settingsRow();
              return row?.peopleUrl?.trim() || undefined;
            },
            resolveCredentials: async () => {
              const row = await this.settingsRow();
              let clientSecret = config.clientSecret;
              if (
                row?.sealedClientSecret &&
                this.app.container.has(secretsServiceToken)
              ) {
                try {
                  clientSecret = this.app.container
                    .resolve(secretsServiceToken)
                    .open(row.sealedClientSecret, {
                      purpose: OA_SECRET_PURPOSE,
                      aad: oaSettingsAad(row),
                    });
                } catch {
                  clientSecret = config.clientSecret;
                }
              }
              return {
                tokenUrl: row?.tokenUrl ?? config.tokenUrl,
                meetingUrl: row?.meetingUrl ?? config.meetingUrl,
                peopleUrl: row?.peopleUrl?.trim() || undefined,
                clientId: row?.clientId ?? config.clientId,
                clientSecret,
                scope: row?.scope ?? config.scope,
              };
            },
          }),
    );
  }

  private async settingsRow(): Promise<MeetingOaSettings | undefined> {
    if (!this.app.container.has(databaseManagerToken)) return undefined;
    return this.app.container
      .resolve(databaseManagerToken)
      .connection()
      .repository<MeetingOaSettings>(MEETING_OA_SETTINGS)
      .findOne({ filter: { id: 'default' } });
  }

  public override async boot(): Promise<void> {
    if (
      !this.app.container.has(secretsServiceToken) ||
      !this.app.container.has(databaseManagerToken)
    )
      return;
    const secrets = this.app.container.resolve(secretsServiceToken);
    const database = this.app.container.resolve(databaseManagerToken);
    for (const store of createMeetingOaSecretsStores(() =>
      database.connection(),
    )) {
      secrets.registerStore(store);
    }
  }
}
