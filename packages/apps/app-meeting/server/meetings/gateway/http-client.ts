import type { MeetingGatewayConfig } from '../../config/meeting-gateway.js';
import type {
  GatewayAuthorizationComplete,
  GatewayConnection,
  GatewayContentArtifact,
  GatewayParticipantRecord,
  MeetingGatewayAdapter,
} from './adapter.js';
import { continueTo, isGatewayContractReady } from './contract.js';
import { MeetingGatewayError } from './errors.js';
import { assertTencentMarketplaceAuthorizationUrl } from './oauth-url.js';
import { resolveConfiguredOrigin } from './origin.js';
import { collectGatewayPages } from './pagination.js';
import {
  RECORDING_IMPORT_MAX_BYTES,
  assertDownloadUrl,
  artifactsFromText,
  parseRecordFileDetail,
  parseRecordFileList,
  preferredDownloadArtifacts,
} from './record-files.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLOW_NONCE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PARTICIPANT_PAGE_SIZE = 20;

/** Accepts unix seconds (number) or an ISO-8601 instant string from the gateway. */
function parseGatewayUnixSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) {
      return Math.floor(ms / 1000);
    }
  }
  return null;
}

function upstreamFailure(
  status: number,
  body: unknown,
  unknownOnServerError: boolean,
): MeetingGatewayError {
  const reason =
    body &&
    typeof body === 'object' &&
    typeof (body as { reason?: unknown }).reason === 'string'
      ? (body as { reason: string }).reason
      : '';
  if (reason === 'RESOURCE_NOT_ACCESSIBLE') {
    return new MeetingGatewayError(
      reason,
      'The gateway resource is not accessible.',
      'NOT_FOUND',
    );
  }
  if (reason === 'CONTENT_NOT_READY') {
    return new MeetingGatewayError(
      reason,
      'The gateway content is not ready.',
      'ABORTED',
    );
  }
  if (reason === 'CURSOR_INVALID') {
    return new MeetingGatewayError(
      reason,
      'The gateway cursor is invalid.',
      'INVALID_ARGUMENT',
    );
  }
  if (reason === 'PERMISSION_DENIED') {
    return new MeetingGatewayError(
      reason,
      'The gateway denied the request.',
      'PERMISSION_DENIED',
    );
  }
  if (reason === 'AUTH_REQUIRED' || reason === 'TOKEN_INVALID') {
    return new MeetingGatewayError(
      reason,
      'The gateway session is missing or invalid.',
      'UNAUTHENTICATED',
    );
  }
  if (reason === 'INVALID_REQUEST') {
    return new MeetingGatewayError(
      reason,
      'The gateway rejected the request.',
      'INVALID_ARGUMENT',
    );
  }
  if (unknownOnServerError && status >= 500) {
    return new MeetingGatewayError(
      'QUERY_RESULT_UNKNOWN',
      'The gateway result is unknown. Try again later.',
      'UNAVAILABLE',
    );
  }
  return new MeetingGatewayError(
    'UPSTREAM_CONTRACT_ERROR',
    'The gateway rejected the request.',
    'UNAVAILABLE',
    status >= 500,
  );
}

function envelopeData(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { code?: unknown }).code !== 0 ||
    (value as { error_code?: unknown }).error_code !== 0 ||
    !(value as { data?: unknown }).data ||
    typeof (value as { data?: unknown }).data !== 'object' ||
    Array.isArray((value as { data?: unknown }).data)
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'The gateway response did not match the published authorization envelope.',
      'UNAVAILABLE',
    );
  }
  return (value as { data: Record<string, unknown> }).data;
}

function textField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function mapConnection(item: unknown): GatewayConnection {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A gateway connection item did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  const row = item as Record<string, unknown>;
  const connectionId = textField(row.id) ?? textField(row.connection_id);
  const memberId = textField(row.member_id) ?? textField(row.owner_member_id);
  const status = textField(row.status);
  if (!connectionId || !memberId || !status) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A gateway connection item did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  return {
    connectionId,
    applicationId: textField(row.application_id) ?? '',
    name: textField(row.name) ?? '',
    memberId,
    type: textField(row.kind) ?? textField(row.type) ?? '',
    status,
  };
}

function joinTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function corpMember(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
}

function mapParticipant(item: unknown): GatewayParticipantRecord {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A participant item did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  const row = item as Record<string, unknown>;
  const upstreamParticipantId =
    textField(row.uuid) ??
    textField(row.ms_open_id) ??
    textField(row.userid) ??
    textField(row.user_id) ??
    textField(row.participant_id);
  if (!upstreamParticipantId) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A participant item was missing its id.',
      'UNAVAILABLE',
    );
  }
  return {
    upstreamParticipantId,
    joinName: textField(row.join_name) ?? null,
    displayName: textField(row.nickname) ?? null,
    department: textField(row.department) ?? null,
    joinedAt: joinTime(row.join_time ?? row.joined_at),
    jobTitle: textField(row.job_title) ?? textField(row.position) ?? null,
    isCorpMember: corpMember(row.is_corp_member ?? row.is_enterprise_user),
  };
}

export function createHttpMeetingGatewayAdapter(options: {
  config: MeetingGatewayConfig;
  getConfig?: () => Promise<MeetingGatewayConfig>;
  fetchImpl?: typeof fetch;
}): MeetingGatewayAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = Math.min(
    Math.max(options.config.timeoutMs || 15_000, 1),
    30_000,
  );

  async function currentConfig(): Promise<MeetingGatewayConfig> {
    return (await options.getConfig?.()) ?? options.config;
  }

  async function origin(): Promise<string> {
    const config = await currentConfig();
    try {
      return resolveConfiguredOrigin(config.origin, config.originAllowlist);
    } catch {
      throw new MeetingGatewayError(
        'GATEWAY_NOT_CONFIGURED',
        'The meeting gateway origin is not an allowlisted HTTPS origin.',
        'FAILED_PRECONDITION',
      );
    }
  }

  async function requestJson(input: {
    path: string;
    method: 'GET' | 'POST';
    accessToken: string;
    body?: unknown;
    unknownOnServerError?: boolean;
    /** Per-call timeout; defaults to the adapter config cap. */
    timeoutMs?: number;
  }): Promise<Record<string, unknown>> {
    const anonymous = input.accessToken === '';
    if (!anonymous && !input.accessToken.startsWith('mt_')) {
      throw new MeetingGatewayError(
        'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE',
        'A gateway access token is required before this App can call the gateway.',
        'FAILED_PRECONDITION',
      );
    }
    const requestTimeoutMs = Math.min(
      Math.max(input.timeoutMs ?? timeoutMs, 1),
      30_000,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(new URL(input.path, await origin()), {
        method: input.method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          ...(anonymous
            ? {}
            : { Authorization: `Bearer ${input.accessToken}` }),
          ...(input.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The gateway redirected a request this App does not follow.',
          'UNAVAILABLE',
        );
      }
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The gateway returned a non-JSON body.',
          'UNAVAILABLE',
        );
      }
      if (!response.ok && response.status !== 202) {
        throw upstreamFailure(
          response.status,
          envelope,
          input.unknownOnServerError === true,
        );
      }
      return envelopeData(envelope);
    } catch (error) {
      if (error instanceof MeetingGatewayError) throw error;
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        error instanceof Error && error.name === 'AbortError'
          ? 'The gateway request timed out.'
          : 'The gateway request failed before a usable response.',
        'UNAVAILABLE',
        true,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    kind: 'http',
    async startAuthorization(input) {
      const config = await currentConfig();
      if (!isGatewayContractReady(config) || !config.allowedOrigin) {
        throw new MeetingGatewayError(
          'GATEWAY_NOT_CONFIGURED',
          'The meeting gateway contract is not ready.',
          'UNAVAILABLE',
        );
      }
      const flowNonce = input.flowNonce?.trim() ?? '';
      if (!FLOW_NONCE_PATTERN.test(flowNonce)) {
        throw new MeetingGatewayError(
          'OAUTH_STATE_INVALID',
          'A flow nonce is required to start gateway authorization.',
          'INVALID_ARGUMENT',
        );
      }
      let callback: string;
      try {
        callback = continueTo(config.allowedOrigin, flowNonce, {
          allowInsecureHttp: config.allowInsecureHttp === true,
        });
      } catch {
        throw new MeetingGatewayError(
          'GATEWAY_NOT_CONFIGURED',
          'MEETING_GATEWAY_ALLOWED_ORIGIN is not a usable origin. Use HTTPS, http://127.0.0.1 (or localhost), or set MEETING_GATEWAY_ALLOW_INSECURE_HTTP=true for intranet http:// hosts.',
          'UNAVAILABLE',
        );
      }
      const data = await requestJson({
        path: `/api/v1/oauth/authorizations?continue_to=${encodeURIComponent(callback)}`,
        method: 'GET',
        accessToken: '',
      });
      if (
        typeof data.authorization_url !== 'string' ||
        typeof data.transaction_id !== 'string' ||
        typeof data.expires_at !== 'string'
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'startAuthorization did not return authorization_url, transaction_id and expires_at.',
          'UNAVAILABLE',
        );
      }
      return {
        authorizationUrl: assertTencentMarketplaceAuthorizationUrl(
          data.authorization_url,
        ),
        transactionId: data.transaction_id,
        expiresAt: data.expires_at,
      };
    },
    async completeAuthorization(input) {
      if (!FLOW_NONCE_PATTERN.test(input.transactionId)) {
        throw new MeetingGatewayError(
          'OAUTH_STATE_INVALID',
          'The OAuth transaction id is invalid.',
          'FAILED_PRECONDITION',
        );
      }
      // Transaction poll is the legacy path. This gateway often hangs after it
      // has already delivered tokens on continue_to, so keep the wait short.
      const data = await requestJson({
        path: `/api/v1/oauth/authorizations?transaction_id=${encodeURIComponent(input.transactionId)}`,
        method: 'GET',
        accessToken: '',
        timeoutMs: 8_000,
      });
      const tokenType =
        typeof data.token_type === 'string' ? data.token_type : '';
      const accessToken =
        typeof data.access_token === 'string' ? data.access_token : '';
      const expiresIn = data.expires_in;
      const connectionId =
        typeof data.connection_id === 'string' ? data.connection_id : '';
      const memberId = typeof data.member_id === 'string' ? data.member_id : '';
      if (
        tokenType.toLowerCase() !== 'bearer' ||
        !accessToken.startsWith('mt_') ||
        accessToken.length <= 3 ||
        /\s/.test(accessToken) ||
        typeof expiresIn !== 'number' ||
        !Number.isInteger(expiresIn) ||
        expiresIn < 1 ||
        expiresIn > 86_400 ||
        !UUID_PATTERN.test(connectionId) ||
        !UUID_PATTERN.test(memberId)
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The gateway authorization completion did not return a usable bearer token.',
          'UNAVAILABLE',
        );
      }
      const connections = await requestJson({
        path: '/api/v1/me/connections',
        method: 'GET',
        accessToken,
      }).then((body) => {
        if (!Array.isArray(body.items)) {
          throw new MeetingGatewayError(
            'UPSTREAM_CONTRACT_ERROR',
            'listConnections did not return items.',
            'UNAVAILABLE',
          );
        }
        return body.items.map(mapConnection);
      });
      const match = connections.find(
        (item) =>
          item.connectionId === connectionId &&
          item.memberId === memberId &&
          item.status === 'ACTIVE',
      );
      if (!match) {
        throw new MeetingGatewayError(
          'CONNECTION_NOT_ALLOWED',
          'The gateway connection is not active for this member.',
          'FAILED_PRECONDITION',
        );
      }
      const completed: GatewayAuthorizationComplete = {
        tokenType: 'Bearer',
        accessToken,
        expiresIn,
        connectionId,
        memberId,
        connectionName: match.name || null,
        connectionType: match.type || null,
      };
      return completed;
    },
    async listConnections(input) {
      const data = await requestJson({
        path: '/api/v1/me/connections',
        method: 'GET',
        accessToken: input.accessToken,
      });
      if (!Array.isArray(data.items)) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'listConnections did not return items.',
          'UNAVAILABLE',
        );
      }
      return data.items.map(mapConnection);
    },
    async confirmConnection(input, connectionId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(connectionId)) {
        throw new MeetingGatewayError(
          'CONNECTION_NOT_ALLOWED',
          'The connection is not in the caller’s authorized set.',
          'FAILED_PRECONDITION',
        );
      }
      const data = await requestJson({
        path: `/api/v1/connections/${connectionId}/confirm`,
        method: 'POST',
        accessToken: input.accessToken,
        body: {},
      });
      if (
        typeof data.id !== 'string' ||
        typeof data.status !== 'string' ||
        typeof data.application_id !== 'string' ||
        typeof data.name !== 'string' ||
        typeof data.owner_member_id !== 'string' ||
        typeof data.kind !== 'string'
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'confirmConnection did not return id and status.',
          'UNAVAILABLE',
        );
      }
      return {
        connectionId: data.id,
        applicationId: data.application_id,
        name: data.name,
        memberId: data.owner_member_id,
        type: data.kind,
        status: data.status,
      };
    },
    async queryMeetings(input) {
      const config = await currentConfig();
      if (!isGatewayContractReady(config)) {
        throw new MeetingGatewayError(
          'GATEWAY_NOT_CONFIGURED',
          'The meeting gateway contract is not ready.',
          'UNAVAILABLE',
        );
      }
      if (input.connectionRef !== input.connectionRef.trim()) {
        throw new MeetingGatewayError(
          'CONNECTION_NOT_ALLOWED',
          'The query connection does not match the signed-in binding.',
          'FAILED_PRECONDITION',
        );
      }
      const startAt = Math.floor(Date.parse(input.window.startedAt) / 1000);
      const endAt = Math.floor(Date.parse(input.window.endedAt) / 1000);
      const data = await requestJson({
        path: '/api/v1/meeting-queries',
        method: 'POST',
        accessToken: input.accessToken,
        unknownOnServerError: true,
        body: {
          selection: 'USER_WINDOW',
          connection_ref: input.connectionRef,
          target_member_id: input.memberId,
          start_at: startAt,
          end_at: endAt,
        },
      });
      const items = data.items;
      if (
        data.selection !== 'USER_WINDOW' ||
        !Array.isArray(items) ||
        data.meeting_count !== items.length
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The meeting query response did not match USER_WINDOW.',
          'UNAVAILABLE',
        );
      }
      return items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new MeetingGatewayError(
            'UPSTREAM_CONTRACT_ERROR',
            'A meeting query item did not match the contract.',
            'UNAVAILABLE',
          );
        }
        const row = item as Record<string, unknown>;
        const startAt = parseGatewayUnixSeconds(row.start_at);
        const endAt = parseGatewayUnixSeconds(row.end_at);
        if (
          typeof row.meeting_id !== 'string' ||
          row.connection_ref !== input.connectionRef ||
          startAt === null ||
          endAt === null
        ) {
          throw new MeetingGatewayError(
            'UPSTREAM_CONTRACT_ERROR',
            'A meeting query item did not match the contract.',
            'UNAVAILABLE',
          );
        }
        return {
          upstreamMeetingId: row.meeting_id,
          title: typeof row.subject === 'string' ? row.subject : null,
          meetingCode:
            typeof row.meeting_code === 'string' ? row.meeting_code : null,
          startedAt: new Date(startAt * 1000).toISOString(),
          endedAt: new Date(endAt * 1000).toISOString(),
          organizationId: config.instanceId || '',
          connectionRef: input.connectionRef,
          cycleKey: typeof row.state === 'string' ? row.state : '',
        };
      });
    },
    async listParticipants(input) {
      if (
        !FLOW_NONCE_PATTERN.test(input.connectionRef) ||
        !FLOW_NONCE_PATTERN.test(input.meetingId)
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'Participant list identifiers did not match the published contract.',
          'INVALID_ARGUMENT',
        );
      }
      return collectGatewayPages({
        meetingId: input.meetingId,
        pageSize: PARTICIPANT_PAGE_SIZE,
        itemId: (item) => item.upstreamParticipantId,
        fetchPage: async (pos, size) => {
          const data = await requestJson({
            path: `/api/v1/connections/${input.connectionRef}/meetings/${input.meetingId}/participants?pos=${String(pos)}&size=${String(size)}`,
            method: 'GET',
            accessToken: input.accessToken,
          });
          if (
            typeof data.has_remaining !== 'boolean' ||
            !Array.isArray(data.participants)
          ) {
            throw new MeetingGatewayError(
              'UPSTREAM_CONTRACT_ERROR',
              'The participant page did not match the published contract.',
              'UNAVAILABLE',
            );
          }
          return {
            meetingId:
              typeof data.meeting_id === 'string' ? data.meeting_id : '',
            pos: typeof data.pos === 'number' ? data.pos : -1,
            size: typeof data.size === 'number' ? data.size : -1,
            hasRemaining: data.has_remaining,
            nextPos:
              data.has_remaining && typeof data.next_pos === 'number'
                ? data.next_pos
                : null,
            items: data.participants.map(mapParticipant),
          };
        },
      });
    },
    async listRecordings(input) {
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.connectionRef) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.meetingId)
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'Recording list identifiers did not match the published contract.',
          'INVALID_ARGUMENT',
        );
      }
      const pageSize = 100;
      const envelope = await requestJson({
        path: `/api/v1/connections/${input.connectionRef}/meetings/${input.meetingId}/record-files?pos=0&size=${String(pageSize)}`,
        method: 'GET',
        accessToken: input.accessToken,
      });
      return parseRecordFileList(
        { code: 0, error_code: 0, data: envelope },
        input.meetingId,
        0,
        pageSize,
      );
    },
    async importRecordingContent(input) {
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.connectionRef) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.recordFileId)
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'Recording identifiers did not match the published contract.',
          'INVALID_ARGUMENT',
        );
      }
      const details = await requestJson({
        path: `/api/v1/connections/${input.connectionRef}/record-files/${input.recordFileId}`,
        method: 'GET',
        accessToken: input.accessToken,
      });
      const artifacts: GatewayContentArtifact[] = [];
      let failed = 0;
      for (const item of preferredDownloadArtifacts(details)) {
        let url: URL;
        try {
          url = assertDownloadUrl(item.url);
        } catch {
          failed += 1;
          continue;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'error',
            signal: controller.signal,
          });
        } catch {
          failed += 1;
          continue;
        } finally {
          clearTimeout(timeoutId);
        }
        if (!response.ok) {
          failed += 1;
          continue;
        }
        if (response.url) {
          try {
            assertDownloadUrl(response.url);
          } catch {
            failed += 1;
            continue;
          }
        }
        const length = Number(response.headers.get('content-length') ?? '0');
        if (length > RECORDING_IMPORT_MAX_BYTES) {
          failed += 1;
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > RECORDING_IMPORT_MAX_BYTES) {
          failed += 1;
          continue;
        }
        artifacts.push(artifactsFromText(item.group, buffer.toString('utf8')));
      }
      if (failed > 0 || artifacts.length === 0) {
        throw new MeetingGatewayError(
          'SOURCE_NOT_IMPORTABLE',
          'No complete importable recording text was downloaded.',
          'FAILED_PRECONDITION',
        );
      }
      return artifacts;
    },
    async getRecordFileDetail(input) {
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.connectionRef) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.recordFileId)
      ) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'Recording identifiers did not match the published contract.',
          'INVALID_ARGUMENT',
        );
      }
      const details = await requestJson({
        path: `/api/v1/connections/${input.connectionRef}/record-files/${input.recordFileId}`,
        method: 'GET',
        accessToken: input.accessToken,
      });
      return parseRecordFileDetail(details, input.recordFileId);
    },
  };
}
