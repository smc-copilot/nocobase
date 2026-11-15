import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import type { MeetingOaConfig } from '../config/meeting-oa.js';
import { createHttpMeetingOaAdapter } from '../meetings/oa/http-adapter.js';
import { createMeetingOaSecretsStores } from '../meetings/oa/secrets.js';
import { TestMeetingOaAdapter } from '../meetings/oa/test-adapter.js';
import { meetingOaAdapterToken } from '../meetings/oa/token.js';

export default class MeetingOaProvider extends ServiceProvider<Application> {
  readonly name = 'app/meeting-oa';

  public override register(): void {
    const config =
      this.app.config.get<MeetingOaConfig>('meetingOa') ??
      ({ timeoutMs: 15_000, testAdapter: false } satisfies MeetingOaConfig);
    this.app.container.singleton(meetingOaAdapterToken, () =>
      config.testAdapter
        ? new TestMeetingOaAdapter()
        : createHttpMeetingOaAdapter({ config }),
    );
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
