import type { Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import type { MeetingGatewayConfig } from '../config/meeting-gateway.js';
import type { MeetingOaConfig } from '../config/meeting-oa.js';
import { MeetingContentService } from './content-service.js';
import { MeetingGatewayService } from './gateway-service.js';
import { meetingGatewayAdapterToken } from './gateway/token.js';
import { MeetingOaDraftService } from './oa/draft-service.js';
import { MeetingOaExecutor } from './oa/executor.js';
import { MeetingOaIdentityService } from './oa/identity-service.js';
import { MeetingOaOperationService } from './oa/operation-service.js';
import { MeetingOaSettingsService } from './oa/settings-service.js';
import { meetingOaAdapterToken } from './oa/token.js';
import { MeetingQueryRunService } from './query-run-service.js';
import { MeetingQueryService } from './service.js';
import { MeetingSupplementalFileService } from './supplemental-files.js';

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
  const oaConfig =
    app.config.get<MeetingOaConfig>('meetingOa') ??
    ({ timeoutMs: 15_000, testAdapter: false } satisfies MeetingOaConfig);
  const oaAdapter = app.container.resolve(meetingOaAdapterToken);
  const userId = currentUserId(context);
  const contents = new MeetingContentService(
    connection,
    authz,
    gateway,
    adapter,
    userId,
  );
  const identity = new MeetingOaIdentityService(
    connection,
    authz,
    userId,
    oaAdapter,
  );
  const drafts = new MeetingOaDraftService(
    connection,
    authz,
    contents,
    userId,
    oaConfig.testAdapter === true,
  );
  const executor = new MeetingOaExecutor(connection, oaAdapter);
  return {
    meetings: new MeetingQueryService(connection, authz),
    gateway,
    queries: new MeetingQueryRunService(
      connection,
      authz,
      gateway,
      adapter,
      config,
      userId,
      config.testAdapter ? async () => undefined : undefined,
    ),
    contents,
    identity,
    drafts,
    operations: new MeetingOaOperationService(
      connection,
      authz,
      drafts,
      identity,
      executor,
      userId,
      oaConfig.testAdapter === true,
    ),
    oaSettings: new MeetingOaSettingsService(
      connection,
      authz,
      secrets,
      oaAdapter,
      oaConfig,
      userId,
    ),
    files: new MeetingSupplementalFileService(
      connection,
      authz,
      userId,
      app.paths.storage('meeting-supplemental'),
    ),
    oaAdapter,
  };
}
