import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import {
  bindMeetingOaSsoRuntime,
  type MeetingOaSsoUserRow,
} from '../auth/oa-ltpa/runtime.js';
import type { MeetingOaConfig } from '../config/meeting-oa.js';
import type { MeetingOaSsoConfig } from '../config/meeting-oa-sso.js';
import { employeeNosMatch } from '../meetings/oa/sso-normalize.js';
import {
  createOaSsoValidator,
  resolveOaSsoValidateMethod,
} from '../meetings/oa/sso-validator.js';

function normalizeConfig(
  raw: MeetingOaSsoConfig | undefined,
  oa?: MeetingOaConfig,
): MeetingOaSsoConfig {
  return {
    enabled: raw?.enabled === true,
    validateUrl: raw?.validateUrl?.trim() || undefined,
    cookieName: raw?.cookieName?.trim() || 'LtpaToken',
    timeoutMs: Math.min(Math.max(Number(raw?.timeoutMs) || 10_000, 1), 30_000),
    oaLoginUrl: raw?.oaLoginUrl?.trim() || undefined,
    validateMethod: resolveOaSsoValidateMethod(
      typeof raw?.validateMethod === 'string' ? raw.validateMethod : undefined,
    ),
    allowInsecureHttp:
      raw?.allowInsecureHttp === true || oa?.allowInsecureHttp === true,
  };
}

export default class MeetingOaSsoProvider extends ServiceProvider<Application> {
  readonly name = 'app/meeting-oa-sso';

  private fetchImpl: typeof fetch | undefined;

  /** Test-only: replace the outbound fetch used by the OA SSO validator. */
  public setFetchImplForTests(fetchImpl: typeof fetch | undefined): void {
    this.fetchImpl = fetchImpl;
    this.bindRuntime();
  }

  public override register(): void {
    this.bindRuntime();
  }

  public override async boot(): Promise<void> {
    this.bindRuntime();
  }

  private bindRuntime(): void {
    const resolveConfig = (): MeetingOaSsoConfig =>
      normalizeConfig(
        this.app.config.get<MeetingOaSsoConfig>('meetingOaSso'),
        this.app.config.get<MeetingOaConfig>('meetingOa'),
      );

    bindMeetingOaSsoRuntime({
      resolveConfig,
      resolveValidator: () =>
        createOaSsoValidator({
          config: resolveConfig(),
          fetchImpl: this.fetchImpl,
        }),
      findUsersByEmployeeNo: async (employeeNo) => {
        if (!this.app.container.has(databaseManagerToken)) return [];
        const rows = await this.app.container
          .resolve(databaseManagerToken)
          .connection()
          .query.selectFrom('user')
          .select([
            'id',
            'username',
            'name',
            'email',
            'emailVerified',
            'image',
            'createdAt',
            'updatedAt',
            'disabledAt',
            'deletedAt',
            'kind',
          ])
          .where('deletedAt', 'is', null)
          .where('username', 'is not', null)
          .execute();
        const matched: MeetingOaSsoUserRow[] = [];
        for (const row of rows) {
          const username =
            typeof row.username === 'string' ? row.username : null;
          if (!username || !employeeNosMatch(username, employeeNo)) continue;
          const id = typeof row.id === 'string' ? row.id : '';
          if (!id) continue;
          matched.push({
            id,
            username,
            name: typeof row.name === 'string' ? row.name : '',
            email: typeof row.email === 'string' ? row.email : '',
            emailVerified: row.emailVerified === true,
            image: typeof row.image === 'string' ? row.image : null,
            createdAt:
              row.createdAt instanceof Date || typeof row.createdAt === 'string'
                ? row.createdAt
                : new Date(0),
            updatedAt:
              row.updatedAt instanceof Date || typeof row.updatedAt === 'string'
                ? row.updatedAt
                : new Date(0),
            disabledAt:
              row.disabledAt instanceof Date ||
              typeof row.disabledAt === 'string'
                ? row.disabledAt
                : null,
            deletedAt:
              row.deletedAt instanceof Date || typeof row.deletedAt === 'string'
                ? row.deletedAt
                : null,
            kind: typeof row.kind === 'string' ? row.kind : null,
          });
        }
        return matched;
      },
      findUsernameByUserId: async (userId) => {
        if (!userId || !this.app.container.has(databaseManagerToken)) {
          return null;
        }
        const row = await this.app.container
          .resolve(databaseManagerToken)
          .connection()
          .query.selectFrom('user')
          .select(['username'])
          .where('id', '=', userId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();
        return typeof row?.username === 'string' && row.username.trim()
          ? row.username
          : null;
      },
      audit: (event) => {
        if (!this.app.container.has(loggingToken)) return;
        this.app.container
          .resolve(loggingToken)
          .getLogger('meeting-oa-sso')
          .info(
            {
              result: event.result,
              reason: event.reason,
              userId: event.userId,
              oaElapsedMs: event.oaElapsedMs,
            },
            'meeting oa sso',
          );
      },
    });
  }
}
