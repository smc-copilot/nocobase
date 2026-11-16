import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { SecretsService } from '@nocobase/app-server/secrets';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import type {
  GatewayConnection,
  MeetingGatewayAdapter,
} from './gateway/adapter.js';
import { MeetingGatewayError } from './gateway/errors.js';
import { oauthStateAad } from './gateway/secrets.js';
import type { ResolvedMeetingGatewayConfig } from './gateway/settings-service.js';
import {
  GATEWAY_SECRET_PURPOSE,
  MEETING_GATEWAY_BINDINGS,
  MEETING_OAUTH_STATES,
  MEETING_RESOURCE,
  type GatewayBindingStatus,
  type MeetingGatewayBinding,
  type MeetingOauthState,
} from './resources.js';

const TEST_ACCESS_TOKEN = 'mt_test_token';
const CONNECTION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface GatewayConfigPublic {
  configured: boolean;
  originConfigured: boolean;
  applicationConfigured: boolean;
  identityIssuance: 'unavailable' | 'test-adapter' | 'stored';
  testAdapter: boolean;
  queryHttpContract: 'unavailable';
  disconnectRevokesUpstream: false;
  rootUnrestrictedReadsAllMeetings: true;
}

export interface GatewayBindingPublic {
  id: string;
  status: GatewayBindingStatus;
  connectionRef: string | null;
  connectionName: string | null;
  connectionType: string | null;
  availableConnections: readonly {
    connectionId: string;
    name: string;
    type: string;
    status: string;
  }[];
  disconnectRevokesUpstream: false;
  updatedAt: string;
}

export interface GatewayStartResult {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
}

function requireUser(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: 'meetings',
      message: 'Sign in to manage meeting gateway connections.',
    });
  }
  return userId;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class MeetingGatewayService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly secrets: SecretsService,
    private readonly adapter: MeetingGatewayAdapter,
    private readonly resolveRuntime: () => Promise<ResolvedMeetingGatewayConfig>,
    private readonly userId: string | undefined,
    private readonly resolveReturnTo: (
      runtime: ResolvedMeetingGatewayConfig,
    ) => string,
  ) {}

  private async requireAction(
    action: 'manageConnections' | 'query' | 'read',
  ): Promise<void> {
    const decision = await this.authz.authorize({
      resource: { type: 'composite', id: MEETING_RESOURCE },
      action,
    });
    if (decision.effect === 'deny') {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: 'meetings',
        message: 'This meeting gateway action is unavailable.',
      });
    }
  }

  async configStatus(): Promise<GatewayConfigPublic> {
    const runtime = await this.resolveRuntime();
    const originConfigured = Boolean(
      runtime.origin && runtime.originAllowlist.length,
    );
    return {
      configured: originConfigured && Boolean(runtime.applicationId),
      originConfigured,
      applicationConfigured: Boolean(runtime.applicationId),
      identityIssuance: runtime.testAdapter ? 'test-adapter' : 'unavailable',
      testAdapter: runtime.testAdapter === true,
      queryHttpContract: 'unavailable',
      disconnectRevokesUpstream: false,
      rootUnrestrictedReadsAllMeetings: true,
    };
  }

  private bindings() {
    return this.connection.repository<MeetingGatewayBinding>(
      MEETING_GATEWAY_BINDINGS,
    );
  }

  private states() {
    return this.connection.repository<MeetingOauthState>(MEETING_OAUTH_STATES);
  }

  private async ownBinding(): Promise<MeetingGatewayBinding | undefined> {
    const userId = requireUser(this.userId);
    const runtime = await this.resolveRuntime();
    return await this.bindings().findOne({
      filter: buildFilter((filter) =>
        filter.and([
          filter.string('userId').eq(userId),
          filter
            .string('gatewayInstanceId')
            .eq(runtime.instanceId || 'default'),
        ]),
      ),
    });
  }

  private allowedConnections(
    connections: readonly GatewayConnection[],
    runtime: ResolvedMeetingGatewayConfig,
  ): GatewayConnection[] {
    const expectedApplicationId =
      runtime.expectedApplicationId ||
      runtime.applicationId ||
      'test-application';
    return connections.filter(
      (item) =>
        item.applicationId === expectedApplicationId &&
        item.type === 'THIRD_PARTY_OAUTH',
    );
  }

  private publicBinding(
    row: MeetingGatewayBinding | undefined,
    available: readonly GatewayConnection[] = [],
  ): GatewayBindingPublic {
    const status = row?.status ?? 'not_configured';
    return {
      id: row?.id ?? 'none',
      status,
      connectionRef: row?.connectionRef ?? null,
      connectionName: row?.connectionName ?? null,
      connectionType: row?.connectionType ?? null,
      availableConnections: available.map((item) => ({
        connectionId: item.connectionId,
        name: item.name,
        type: item.type,
        status: item.status,
      })),
      disconnectRevokesUpstream: false,
      updatedAt: row ? toIso(row.updatedAt) : new Date(0).toISOString(),
    };
  }

  async getBinding(): Promise<GatewayBindingPublic> {
    await this.requireAction('manageConnections');
    const status = await this.configStatus();
    const runtime = await this.resolveRuntime();
    if (!status.configured && !runtime.testAdapter) {
      return this.publicBinding(undefined);
    }
    const row = await this.ownBinding();
    if (!row || row.status === 'disconnected') {
      return this.publicBinding(
        row ??
          ({
            id: 'none',
            status:
              status.identityIssuance === 'unavailable'
                ? 'identity_unavailable'
                : 'pending',
            updatedAt: new Date(0),
          } as MeetingGatewayBinding),
      );
    }
    if (row.status === 'awaiting_connection' && row.sealedAccessToken) {
      try {
        const accessToken = this.openBindingToken(row);
        const connections = await this.adapter.listConnections({
          accessToken,
        });
        return this.publicBinding(
          row,
          this.allowedConnections(connections, runtime),
        );
      } catch {
        return this.publicBinding(row);
      }
    }
    return this.publicBinding(row);
  }

  private accessTokenForStart(): string {
    if (this.adapter.kind === 'test') return TEST_ACCESS_TOKEN;
    throw new MeetingGatewayError(
      'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE',
      'The first gateway access token is issued by account-login and exchange in the published client.js. This App does not collect a gateway password or a pasted token.',
      'FAILED_PRECONDITION',
    );
  }

  async start(): Promise<GatewayStartResult> {
    await this.requireAction('manageConnections');
    const userId = requireUser(this.userId);
    const runtime = await this.resolveRuntime();
    if (!runtime.testAdapter && !(await this.configStatus()).configured) {
      throw new MeetingGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'The meeting gateway origin and application id are not configured.',
        'FAILED_PRECONDITION',
      );
    }
    const pending = (
      await this.states().findMany({
        filter: { userId },
      })
    ).find((item) => !item.consumedAt);
    if (pending) {
      if (new Date(pending.expiresAt).getTime() > Date.now()) {
        throw new MeetingGatewayError(
          'OAUTH_ALREADY_PENDING',
          'An authorization attempt is already pending for this user.',
          'ALREADY_EXISTS',
        );
      }
      await this.states().updateOne({
        filter: { id: pending.id },
        values: { consumedAt: new Date() },
      });
    }
    const accessToken = this.accessTokenForStart();
    const stateId = randomUUID();
    const ttl = Math.min(
      Math.max(runtime.oauthStateTtlMs || 300_000, 60_000),
      300_000,
    );
    const expiresAt = new Date(Date.now() + ttl);
    const applicationId = runtime.applicationId || 'test-application';
    const returnTo = new URL(this.resolveReturnTo(runtime));
    returnTo.searchParams.set('localState', stateId);
    const started = await this.adapter.startAuthorization({
      accessToken,
      applicationId,
      returnTo: returnTo.toString(),
    });
    const sealed = this.secrets.ready
      ? this.secrets.seal(accessToken, {
          purpose: GATEWAY_SECRET_PURPOSE,
          aad: oauthStateAad({ id: stateId, userId }),
        })
      : null;
    if (!sealed) {
      throw new MeetingGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'Secrets are not configured, so gateway tokens cannot be sealed.',
        'FAILED_PRECONDITION',
      );
    }
    const now = new Date();
    await this.states().createOne({
      values: {
        id: stateId,
        userId,
        expiresAt,
        transactionId: started.transactionId,
        sealedAccessToken: sealed,
        returnTo: returnTo.toString(),
        createdAt: now,
      },
    });
    return {
      authorizationUrl: started.authorizationUrl,
      state: stateId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  peekCallback(state: string | undefined): { status: 'pending_completion' } {
    if (state && state.length > 128) {
      throw new MeetingGatewayError(
        'OAUTH_STATE_INVALID',
        'The OAuth state is invalid.',
        'INVALID_ARGUMENT',
      );
    }
    return { status: 'pending_completion' };
  }

  async complete(state: string): Promise<GatewayBindingPublic> {
    await this.requireAction('manageConnections');
    const userId = requireUser(this.userId);
    const runtime = await this.resolveRuntime();
    const accessToken = await this.connection.transaction(async (trx) =>
      this.openPendingOauthToken(trx, state, userId, { consume: false }),
    );
    const connections = await this.adapter.listConnections({ accessToken });
    const owned = this.allowedConnections(connections, runtime);
    return this.connection.transaction(async (trx) => {
      await this.openPendingOauthToken(trx, state, userId, { consume: true });
      const now = new Date();
      const bindings = trx.repository<MeetingGatewayBinding>(
        MEETING_GATEWAY_BINDINGS,
      );
      const existing = await bindings.findOne({
        filter: buildFilter((filter) =>
          filter.and([
            filter.string('userId').eq(userId),
            filter
              .string('gatewayInstanceId')
              .eq(runtime.instanceId || 'default'),
          ]),
        ),
      });
      const nextVersion = (existing?.credentialVersion ?? 0) + 1;
      const bindingId = existing?.id ?? randomUUID();
      const single = owned.length === 1 ? owned[0] : undefined;
      const sealedAccess = this.secrets.seal(accessToken, {
        purpose: GATEWAY_SECRET_PURPOSE,
        aad: [bindingId, userId, String(nextVersion)],
      });
      const values: Partial<MeetingGatewayBinding> = {
        status: single ? 'active' : 'awaiting_connection',
        gatewayInstanceId: runtime.instanceId || 'default',
        organizationId: existing?.organizationId ?? null,
        gatewayMemberId: single?.memberId ?? owned[0]?.memberId ?? null,
        connectionRef: single?.connectionId ?? null,
        connectionName: single?.name ?? null,
        connectionType: single?.type ?? null,
        credentialVersion: nextVersion,
        sealedAccessToken: sealedAccess,
        sealedRefreshToken: null,
        disconnectRevokesUpstream: false,
        updatedAt: now,
      };
      if (existing) {
        await bindings.updateOne({
          filter: { id: existing.id, userId },
          values,
        });
      } else {
        await bindings.createOne({
          values: {
            id: bindingId,
            userId,
            createdAt: now,
            ...values,
          },
        });
      }
      const saved = await bindings.findOne({
        filter: { id: bindingId, userId },
      });
      return this.publicBinding(saved, owned);
    });
  }

  async select(connectionId: string): Promise<GatewayBindingPublic> {
    await this.requireAction('manageConnections');
    const userId = requireUser(this.userId);
    if (!CONNECTION_ID.test(connectionId)) {
      throw new MeetingGatewayError(
        'CONNECTION_NOT_ALLOWED',
        'The connection is not in the caller’s authorized set.',
        'FAILED_PRECONDITION',
      );
    }
    const row = await this.requireActiveOrAwaiting();
    const accessToken = this.openBindingToken(row);
    const runtime = await this.resolveRuntime();
    const connections = this.allowedConnections(
      await this.adapter.listConnections({ accessToken }),
      runtime,
    );
    const match = connections.find(
      (item) =>
        item.connectionId === connectionId &&
        item.memberId === (row.gatewayMemberId || item.memberId),
    );
    if (!match) {
      throw new MeetingGatewayError(
        'CONNECTION_NOT_ALLOWED',
        'The connection is not in the caller’s authorized set.',
        'FAILED_PRECONDITION',
      );
    }
    let confirmed = match;
    if (match.status === 'PENDING_CONFIRMATION') {
      confirmed = await this.adapter.confirmConnection(
        { accessToken },
        connectionId,
      );
    }
    if (confirmed.status !== 'ACTIVE') {
      throw new MeetingGatewayError(
        'CONNECTION_NOT_ALLOWED',
        'The connection is not in the caller’s authorized set.',
        'FAILED_PRECONDITION',
      );
    }
    const now = new Date();
    await this.bindings().updateOne({
      filter: { id: row.id, userId },
      values: {
        status: 'active',
        connectionRef: confirmed.connectionId,
        connectionName: confirmed.name,
        connectionType: confirmed.type,
        gatewayMemberId: confirmed.memberId,
        updatedAt: now,
      },
    });
    return this.publicBinding(await this.ownBinding(), connections);
  }

  async disconnect(): Promise<GatewayBindingPublic> {
    await this.requireAction('manageConnections');
    const userId = requireUser(this.userId);
    const row = await this.ownBinding();
    if (!row) {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'There is no gateway binding to disconnect.',
        'FAILED_PRECONDITION',
      );
    }
    const now = new Date();
    await this.bindings().updateOne({
      filter: { id: row.id, userId },
      values: {
        status: 'disconnected',
        credentialVersion: row.credentialVersion + 1,
        sealedAccessToken: null,
        sealedRefreshToken: null,
        connectionRef: row.connectionRef,
        updatedAt: now,
      },
    });
    return this.publicBinding(await this.ownBinding());
  }

  async requireActiveBinding(): Promise<MeetingGatewayBinding> {
    const runtime = await this.resolveRuntime();
    if (!runtime.testAdapter && !(await this.configStatus()).configured) {
      throw new MeetingGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'The meeting gateway origin and application id are not configured.',
        'FAILED_PRECONDITION',
      );
    }
    const row = await this.ownBinding();
    if (!row || row.status !== 'active' || !row.connectionRef) {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'Bind a meeting gateway connection before querying.',
        'FAILED_PRECONDITION',
      );
    }
    return row;
  }

  private async openPendingOauthToken(
    connection: DatabaseConnection,
    state: string,
    userId: string,
    options: { consume: boolean },
  ): Promise<string> {
    const states =
      connection.repository<MeetingOauthState>(MEETING_OAUTH_STATES);
    const row = await states.findOne({
      filter: buildFilter((filter) => filter.string('id').eq(state)),
    });
    if (!row || row.userId !== userId) {
      throw new MeetingGatewayError(
        'OAUTH_STATE_INVALID',
        'The OAuth state is invalid.',
        'FAILED_PRECONDITION',
      );
    }
    if (row.consumedAt) {
      throw new MeetingGatewayError(
        'OAUTH_STATE_REPLAYED',
        'The OAuth state was already consumed.',
        'FAILED_PRECONDITION',
      );
    }
    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      await states.updateOne({
        filter: buildFilter((filter) =>
          filter.and([
            filter.string('id').eq(row.id),
            filter.string('userId').eq(userId),
          ]),
        ),
        values: { consumedAt: new Date() },
      });
      throw new MeetingGatewayError(
        'OAUTH_STATE_EXPIRED',
        'The OAuth state has expired.',
        'FAILED_PRECONDITION',
      );
    }
    if (!row.sealedAccessToken || !this.secrets.ready) {
      throw new MeetingGatewayError(
        'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE',
        'The stored gateway credential is no longer valid.',
        'FAILED_PRECONDITION',
      );
    }
    let accessToken: string;
    try {
      accessToken = this.secrets.open(row.sealedAccessToken, {
        purpose: GATEWAY_SECRET_PURPOSE,
        aad: oauthStateAad({ id: row.id, userId: row.userId }),
      });
    } catch {
      throw new MeetingGatewayError(
        'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE',
        'The stored gateway credential is no longer valid.',
        'FAILED_PRECONDITION',
      );
    }
    if (options.consume) {
      await states.updateOne({
        filter: buildFilter((filter) =>
          filter.and([
            filter.string('id').eq(row.id),
            filter.string('userId').eq(userId),
            filter.date('consumedAt').empty(),
          ]),
        ),
        values: { consumedAt: new Date() },
      });
    }
    return accessToken;
  }

  openBindingToken(row: MeetingGatewayBinding): string {
    if (!row.sealedAccessToken || !this.secrets.ready) {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'The stored gateway credential is no longer valid.',
        'FAILED_PRECONDITION',
      );
    }
    try {
      return this.secrets.open(row.sealedAccessToken, {
        purpose: GATEWAY_SECRET_PURPOSE,
        aad: [row.id, row.userId, String(row.credentialVersion)],
      });
    } catch {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'The stored gateway credential is no longer valid.',
        'FAILED_PRECONDITION',
      );
    }
  }

  private async requireActiveOrAwaiting(): Promise<MeetingGatewayBinding> {
    const row = await this.ownBinding();
    if (
      !row ||
      (row.status !== 'active' && row.status !== 'awaiting_connection')
    ) {
      throw new MeetingGatewayError(
        'GATEWAY_REAUTH_REQUIRED',
        'Complete authorization before selecting a connection.',
        'FAILED_PRECONDITION',
      );
    }
    return row;
  }
}
