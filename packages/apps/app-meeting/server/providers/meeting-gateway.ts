import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import type { MeetingGatewayConfig } from '../config/meeting-gateway.js';
import { createHttpMeetingGatewayAdapter } from '../meetings/gateway/http-client.js';
import { createMeetingGatewaySecretsStores } from '../meetings/gateway/secrets.js';
import { TestMeetingGatewayAdapter } from '../meetings/gateway/test-adapter.js';
import { meetingGatewayAdapterToken } from '../meetings/gateway/token.js';

export default class MeetingGatewayProvider extends ServiceProvider<Application> {
  readonly name = 'app/meeting-gateway';

  public override register(): void {
    const config =
      this.app.config.get<MeetingGatewayConfig>('meetingGateway') ??
      ({
        enabled: false,
        originAllowlist: [],
        scopes: [],
        authorizationPathAllowlist: [],
        timeoutMs: 15_000,
        queryMaxDays: 93,
        oauthStateTtlMs: 300_000,
        testAdapter: false,
      } satisfies MeetingGatewayConfig);
    this.app.container.singleton(meetingGatewayAdapterToken, () =>
      config.testAdapter
        ? new TestMeetingGatewayAdapter()
        : createHttpMeetingGatewayAdapter({
            config,
            // Connection material comes from env / config.yml only.
            getConfig: async () => config,
          }),
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
    for (const store of createMeetingGatewaySecretsStores(() =>
      database.connection(),
    )) {
      secrets.registerStore(store);
    }
  }
}
