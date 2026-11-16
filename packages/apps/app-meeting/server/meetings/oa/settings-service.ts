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
import type { MeetingOaAdapter, OaContractMode } from './adapter.js';
import { oaSettingsAad } from './secrets.js';

export interface OaSettingsPublic {
  tokenUrl: string | null;
  peopleUrl: string | null;
  meetingUrl: string | null;
  viewUrl: string | null;
  scope: string | null;
  clientId: string | null;
  tokenUrlConfigured: boolean;
  peopleUrlConfigured: boolean;
  meetingUrlConfigured: boolean;
  clientIdConfigured: boolean;
  hasSecret: boolean;
  writeContract: OaContractMode;
  tokenContract: OaContractMode;
  peopleContract: 'oaPeople.js' | 'test';
  testAdapter: boolean;
  isolationNote: string | null;
  liveVerified: false;
  updatedAt: string | null;
}

function keep(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  if (incoming === undefined) return existing ?? null;
  const trimmed = incoming?.trim() ?? '';
  if (!trimmed) return existing ?? null;
  return trimmed;
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
    meetingUrl?: string | null;
    viewUrl?: string | null;
    scope?: string | null;
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
      tokenUrl: keep(input.tokenUrl, existing?.tokenUrl),
      peopleUrl: keep(input.peopleUrl, existing?.peopleUrl),
      meetingUrl: keep(input.meetingUrl, existing?.meetingUrl),
      viewUrl: keep(input.viewUrl, existing?.viewUrl),
      scope: keep(input.scope, existing?.scope),
      clientId: keep(input.clientId, existing?.clientId),
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
            meetingUrl: values.meetingUrl ?? null,
            viewUrl: values.viewUrl ?? null,
            scope: values.scope ?? null,
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
    const meetingUrl = row?.meetingUrl || this.config.meetingUrl;
    const tokenUrl = row?.tokenUrl || this.config.tokenUrl;
    const hasSecret = Boolean(
      row?.sealedClientSecret || this.config.clientSecret,
    );
    const writeContract: OaContractMode =
      this.adapter.kind === 'test'
        ? 'test'
        : meetingUrl && hasSecret && tokenUrl
          ? 'configured'
          : 'unavailable';
    const tokenContract: OaContractMode =
      this.adapter.kind === 'test'
        ? 'test'
        : tokenUrl && hasSecret
          ? 'configured'
          : 'unavailable';
    return {
      tokenUrl: row?.tokenUrl ?? null,
      peopleUrl: row?.peopleUrl ?? null,
      meetingUrl: row?.meetingUrl ?? null,
      viewUrl: row?.viewUrl ?? null,
      scope: row?.scope ?? null,
      clientId: row?.clientId ?? null,
      tokenUrlConfigured: Boolean(tokenUrl),
      peopleUrlConfigured: Boolean(row?.peopleUrl || this.config.peopleUrl),
      meetingUrlConfigured: Boolean(meetingUrl),
      clientIdConfigured: Boolean(row?.clientId || this.config.clientId),
      hasSecret,
      writeContract,
      tokenContract,
      peopleContract: this.adapter.kind === 'test' ? 'test' : 'oaPeople.js',
      testAdapter: this.config.testAdapter === true,
      isolationNote: this.config.testAdapter
        ? '本地测试数据，未调用真实OA'
        : null,
      liveVerified: false,
      updatedAt: row ? toIso(row.updatedAt) : null,
    };
  }
}
