import type { Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import type { MeetingGatewayConfig } from '../config/meeting-gateway.js';
import { MeetingGatewayService } from './gateway-service.js';
import { meetingGatewayAdapterToken } from './gateway/token.js';
import { MeetingQueryRunService } from './query-run-service.js';
import { MeetingQueryService } from './service.js';

export function currentUserId(
  context: Context<AuthEnv & AuthorizationEnv>,
): string | undefined {
  return context.get('auth')?.user.id;
}

export function meetingReturnTo(app: Application): string {
  const identity = app.config.get<AppIdentityConfig>('app');
  const gateway = app.config.get<MeetingGatewayConfig>('meetingGateway');
  const origin = (
    gateway?.publicBaseUrl ||
    identity?.publicOrigin ||
    'http://localhost'
  ).replace(/\/$/, '');
  const base = (identity?.publicBasePath || '').replace(/\/$/, '');
  return `${origin}${base}/settings/meeting-connections/callback`;
}

export function createMeetingServices(
  app: Application,
  context: Context<AuthEnv & AuthorizationEnv>,
) {
  const database = app.container.resolve(databaseManagerToken);
  const connection = database.connection();
  const authz = context.get('authz');
  const adapter = app.container.resolve(meetingGatewayAdapterToken);
  const secrets = app.container.resolve(secretsServiceToken);
  const config =
    app.config.get<MeetingGatewayConfig>('meetingGateway') ??
    ({
      originAllowlist: [],
      scopes: [],
      authorizationPathAllowlist: [],
      timeoutMs: 15_000,
      queryMaxDays: 93,
      oauthStateTtlMs: 300_000,
      testAdapter: false,
    } satisfies MeetingGatewayConfig);
  const gateway = new MeetingGatewayService(
    connection,
    authz,
    secrets,
    adapter,
    config,
    currentUserId(context),
    meetingReturnTo(app),
  );
  return {
    meetings: new MeetingQueryService(connection, authz),
    gateway,
    queries: new MeetingQueryRunService(
      connection,
      authz,
      gateway,
      adapter,
      config,
      currentUserId(context),
      config.testAdapter ? async () => undefined : undefined,
    ),
  };
}
