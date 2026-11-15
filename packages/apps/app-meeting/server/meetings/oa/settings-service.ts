import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { SecretsService } from '@nocobase/app-server/secrets';
import type { DatabaseConnection } from '@nocobase/db';
import type { MeetingOaConfig } from '../../config/meeting-oa.js';
import { requireMeetingAction, requireUser, toIso } from '../access.js';
import {
  MEETING_OA_SETTINGS,
  OA_SECRET_PURPOSE,
  type MeetingOaSettings,
} from '../resources.js';
import type { MeetingOaAdapter } from './adapter.js';
import { oaSettingsAad } from './secrets.js';

export interface OaSettingsPublic {
  tokenUrl: string | null;
  peopleUrl: string | null;
  clientId: string | null;
  tokenUrlConfigured: boolean;
  peopleUrlConfigured: boolean;
  clientIdConfigured: boolean;
  hasSecret: boolean;
  writeContract: 'unavailable' | 'test';
  tokenContract: 'unavailable' | 'test';
  peopleContract: 'oaPeople.js' | 'test';
  testAdapter: boolean;
  isolationNote: string | null;
  updatedAt: string | null;
}

export class MeetingOaSettingsService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly secrets: SecretsService,
    private readonly adapter: MeetingOaAdapter,
    private readonly config: MeetingOaConfig,
    private readonly userId: string | undefined,
  ) {}

  async get(): Promise<OaSettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    const row = await this.row();
    return this.publicRow(row);
  }

  async save(input: {
    tokenUrl?: string | null;
    peopleUrl?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
  }): Promise<OaSettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    const actor = requireUser(this.userId);
    const now = new Date();
    const existing = await this.row();
    const secret = input.clientSecret?.trim() || '';
    const nextVersion = secret
      ? (existing?.credentialVersion ?? 0) + 1
      : (existing?.credentialVersion ?? 1);
    const values: Partial<MeetingOaSettings> = {
      tokenUrl:
        input.tokenUrl === undefined
          ? (existing?.tokenUrl ?? null)
          : input.tokenUrl,
      peopleUrl:
        input.peopleUrl === undefined
          ? (existing?.peopleUrl ?? null)
          : input.peopleUrl,
      clientId:
        input.clientId === undefined
          ? (existing?.clientId ?? null)
          : input.clientId,
      updatedBy: actor,
      updatedAt: now,
    };
    if (secret) {
      values.credentialVersion = nextVersion;
      values.sealedClientSecret = this.secrets.seal(secret, {
        purpose: OA_SECRET_PURPOSE,
        aad: oaSettingsAad({ id: 'default', credentialVersion: nextVersion }),
      });
    }
    if (existing) {
      await this.connection
        .repository<MeetingOaSettings>(MEETING_OA_SETTINGS)
        .updateOne({ filter: { id: existing.id }, values });
    } else {
      await this.connection
        .repository<MeetingOaSettings>(MEETING_OA_SETTINGS)
        .createOne({
          values: {
            id: 'default',
            tokenUrl: values.tokenUrl ?? null,
            peopleUrl: values.peopleUrl ?? null,
            clientId: values.clientId ?? null,
            sealedClientSecret: values.sealedClientSecret ?? null,
            credentialVersion: values.credentialVersion ?? nextVersion,
            updatedBy: actor,
            createdAt: now,
            updatedAt: now,
          },
        });
    }
    return this.get();
  }

  private async row(): Promise<MeetingOaSettings | undefined> {
    return this.connection
      .repository<MeetingOaSettings>(MEETING_OA_SETTINGS)
      .findOne({ filter: { id: 'default' } });
  }

  private publicRow(row: MeetingOaSettings | undefined): OaSettingsPublic {
    return {
      tokenUrl: row?.tokenUrl ?? null,
      peopleUrl: row?.peopleUrl ?? null,
      clientId: row?.clientId ?? null,
      tokenUrlConfigured: Boolean(row?.tokenUrl || this.config.tokenUrl),
      peopleUrlConfigured: Boolean(row?.peopleUrl || this.config.peopleUrl),
      clientIdConfigured: Boolean(row?.clientId || this.config.clientId),
      hasSecret: Boolean(row?.sealedClientSecret || this.config.clientSecret),
      writeContract: this.adapter.writeContract,
      tokenContract: this.adapter.kind === 'test' ? 'test' : 'unavailable',
      peopleContract: this.adapter.kind === 'test' ? 'test' : 'oaPeople.js',
      testAdapter: this.config.testAdapter === true,
      isolationNote: this.config.testAdapter
        ? '本地测试数据，未调用真实OA'
        : null,
      updatedAt: row ? toIso(row.updatedAt) : null,
    };
  }
}
