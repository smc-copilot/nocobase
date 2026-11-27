import type { MeetingGatewayConfig } from '../../config/meeting-gateway.js';
import { MeetingGatewayError } from './errors.js';
import {
  resolveTencentAuthorizationConfig,
  validateAuthorizationUrl,
} from './oauth-url.js';
import { resolveConfiguredOrigin } from './origin.js';
import type {
  GatewayConnection,
  GatewayContentArtifact,
  MeetingGatewayAdapter,
} from './adapter.js';
import {
  RECORDING_IMPORT_MAX_BYTES,
  assertDownloadUrl,
  artifactsFromText,
  parseRecordFileList,
  preferredDownloadArtifacts,
} from './record-files.js';

const QUERY_CONTRACT_MESSAGE =
  'Meeting query, participant and recording HTTP fields are not in the published gateway client at loudon84/anything-llm@codex/meeting-intelligence (server/utils/meetingGateway/client.js). server/modules/meetings/gatewayDirectory.js is absent from that branch.';

function contractUnavailable(): never {
  throw new MeetingGatewayError(
    'UPSTREAM_CONTRACT_ERROR',
    QUERY_CONTRACT_MESSAGE,
    'UNAVAILABLE',
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

function mapConnection(item: unknown): GatewayConnection {
  if (
    !item ||
    typeof item !== 'object' ||
    typeof (item as { id?: unknown }).id !== 'string' ||
    typeof (item as { application_id?: unknown }).application_id !== 'string' ||
    typeof (item as { name?: unknown }).name !== 'string' ||
    typeof (item as { kind?: unknown }).kind !== 'string' ||
    typeof (item as { status?: unknown }).status !== 'string' ||
    typeof (item as { owner_member_id?: unknown }).owner_member_id !== 'string'
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A gateway connection item did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  const row = item as {
    id: string;
    application_id: string;
    name: string;
    kind: string;
    status: string;
    owner_member_id: string;
  };
  return {
    connectionId: row.id,
    applicationId: row.application_id,
    name: row.name,
    memberId: row.owner_member_id,
    type: row.kind,
    status: row.status,
  };
}

export function createHttpMeetingGatewayAdapter(options: {
  config?: MeetingGatewayConfig;
  resolveConfig?: () => MeetingGatewayConfig | Promise<MeetingGatewayConfig>;
  fetchImpl?: typeof fetch;
}): MeetingGatewayAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function current(): Promise<MeetingGatewayConfig> {
    if (options.resolveConfig) return await options.resolveConfig();
    if (options.config) return options.config;
    throw new MeetingGatewayError(
      'GATEWAY_NOT_CONFIGURED',
      'The meeting gateway origin and application id are not configured.',
      'FAILED_PRECONDITION',
    );
  }

  function timeoutOf(config: MeetingGatewayConfig): number {
    return Math.min(Math.max(config.timeoutMs || 15_000, 1), 30_000);
  }

  async function origin(): Promise<string> {
    const config = await current();
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
  }): Promise<Record<string, unknown>> {
    if (
      typeof input.accessToken !== 'string' ||
      !input.accessToken.startsWith('mt_')
    ) {
      throw new MeetingGatewayError(
        'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE',
        'A gateway access token is required before this App can start OAuth.',
        'FAILED_PRECONDITION',
      );
    }
    const config = await current();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutOf(config));
    try {
      const response = await fetchImpl(new URL(input.path, await origin()), {
        method: input.method,
        redirect: 'error',
        signal: controller.signal,
        headers:
          input.body === undefined
            ? { Authorization: `Bearer ${input.accessToken}` }
            : {
                Authorization: `Bearer ${input.accessToken}`,
                'Content-Type': 'application/json',
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
      if (!response.ok && response.status !== 202) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The gateway rejected an authorization request.',
          'UNAVAILABLE',
          response.status >= 500,
        );
      }
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'The gateway returned a non-JSON authorization envelope.',
          'UNAVAILABLE',
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
      const config = await current();
      const tencent = resolveTencentAuthorizationConfig(config, input.returnTo);
      const data = await requestJson({
        path: '/api/v1/oauth/authorizations',
        method: 'POST',
        accessToken: input.accessToken,
        body: {
          application_id: input.applicationId,
          return_to: input.returnTo,
        },
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
      const authorizationUrl = validateAuthorizationUrl(
        data.authorization_url,
        {
          allowedPaths: config.authorizationPathAllowlist,
          config: tencent,
        },
      );
      return {
        authorizationUrl,
        transactionId: data.transaction_id,
        expiresAt: data.expires_at,
      };
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
    async queryMeetings() {
      contractUnavailable();
    },
    async listParticipants() {
      contractUnavailable();
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
        const timeoutId = setTimeout(
          () => controller.abort(),
          timeoutOf(await current()),
        );
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
  };
}
