import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import {
  resolveMeetingOaApiUrls,
  type MeetingOaConfig,
} from '../../config/meeting-oa.js';
import { requireMeetingAction } from '../access.js';
import type { MeetingOaAdapter, OaContractMode } from './adapter.js';
import { MeetingOaError } from './errors.js';
import type { LiveSessionProber } from './identity-service.js';

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
  peopleUrlSource: 'env' | 'test' | 'none';
  testAdapter: boolean;
  isolationNote: string | null;
  liveVerified: boolean;
  liveVerifyReason: string | null;
  updatedAt: string | null;
}

function peopleUrlSource(
  config: MeetingOaConfig,
  adapterKind: string,
): 'env' | 'test' | 'none' {
  if (adapterKind === 'test') return 'test';
  if (config.peopleUrl?.trim()) return 'env';
  return 'none';
}

export class MeetingOaSettingsService {
  constructor(
    private readonly authz: AuthorizationContext,
    private readonly adapter: MeetingOaAdapter,
    private readonly config: MeetingOaConfig,
    private readonly probeLiveSession?: LiveSessionProber,
  ) {}

  async get(): Promise<OaSettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    return this.publicFromConfig();
  }

  async save(_input: {
    tokenUrl?: string | null;
    peopleUrl?: string | null;
    meetingUrl?: string | null;
    viewUrl?: string | null;
    scope?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
  }): Promise<OaSettingsPublic> {
    await requireMeetingAction(this.authz, 'identityManage');
    void _input;
    throw new MeetingOaError(
      'OA_SETTINGS_INVALID',
      'Meeting OA settings are read from the application environment (packages/apps/app-meeting/.env). The settings form is disabled.',
      'FAILED_PRECONDITION',
    );
  }

  private async publicFromConfig(): Promise<OaSettingsPublic> {
    const resolved = resolveMeetingOaApiUrls(this.config);
    const meetingUrl = resolved.meetingUrl ?? null;
    const tokenUrl = resolved.tokenUrl ?? null;
    const peopleUrl = this.config.peopleUrl?.trim() || null;
    const viewUrl = this.config.viewUrl?.trim() || null;
    const scope = this.config.scope?.trim() || null;
    const clientId = this.config.clientId?.trim() || null;
    const hasSecret = Boolean(this.config.clientSecret?.trim());
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
    const testAdapter = this.config.testAdapter === true;
    let liveVerified = false;
    let liveVerifyReason: string | null = null;
    if (!testAdapter && this.probeLiveSession) {
      const live = await this.probeLiveSession();
      liveVerified = live.liveVerified;
      liveVerifyReason = live.reason;
    }
    return {
      tokenUrl,
      peopleUrl,
      meetingUrl,
      viewUrl,
      scope,
      clientId,
      tokenUrlConfigured: Boolean(tokenUrl),
      peopleUrlConfigured: Boolean(peopleUrl),
      meetingUrlConfigured: Boolean(meetingUrl),
      clientIdConfigured: Boolean(clientId),
      hasSecret,
      writeContract,
      tokenContract,
      peopleContract: this.adapter.kind === 'test' ? 'test' : 'oaPeople.js',
      peopleUrlSource: peopleUrlSource(this.config, this.adapter.kind),
      testAdapter,
      isolationNote: testAdapter ? '本地测试数据，未调用真实OA' : null,
      liveVerified,
      liveVerifyReason,
      updatedAt: null,
    };
  }
}
