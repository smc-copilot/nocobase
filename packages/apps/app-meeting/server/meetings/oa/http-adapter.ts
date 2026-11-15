import type { MeetingOaConfig } from '../../config/meeting-oa.js';
import type {
  FrozenOaPayload,
  MeetingOaAdapter,
  OaCreateMeetingResult,
  OaPerson,
  OaTaskWriteResult,
  OaToken,
  OaUploadSummaryResult,
} from './adapter.js';
import { MeetingOaError } from './errors.js';

const MIN_QUERY_LENGTH = 2;
const WRITE_CONTRACT_MESSAGE =
  'OA write HTTP paths and JSON for createMeeting / uploadSummary / createTaskByMeeting are not in loudon84/anything-llm@codex/meeting-intelligence. server/utils/oa/{index,meetings,payload}.js and server/modules/meetings/oaMeeting.js are absent on that branch. The unpublished local tree E:/git/anything-llm-meeting-cursor@c43c9a58 was not available to this environment.';

const TOKEN_CONTRACT_MESSAGE =
  'PRD V1.1 names client_credentials + employee_no against OA_TOKEN_URL, but does not specify path, query vs body, or response fields. loudon84/anything-llm@codex/meeting-intelligence has no token client. Live token HTTP is not sent.';

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function mapPerson(row: unknown): OaPerson | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const fd_no = asText(record.fd_no);
  const fd_name = asText(record.fd_name);
  const fd_department = asText(record.fd_department);
  if (!fd_no || !fd_name) return null;
  return { fd_no, fd_name, fd_department };
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return Array.isArray(record.data) ? record.data : [];
}

export function createHttpMeetingOaAdapter(options: {
  config: MeetingOaConfig;
  fetchImpl?: typeof fetch;
}): MeetingOaAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeout = Math.min(
    Math.max(Number(options.config.timeoutMs) || 15_000, 1),
    30_000,
  );

  return {
    kind: 'http',
    writeContract: 'unavailable',

    async searchPeople(query: string): Promise<readonly OaPerson[]> {
      const q = query.trim();
      if (q.length < MIN_QUERY_LENGTH) {
        throw new MeetingOaError(
          'INVALID_OA_QUERY',
          `OA people query must be at least ${String(MIN_QUERY_LENGTH)} characters`,
          'INVALID_ARGUMENT',
        );
      }
      const configured = options.config.peopleUrl?.trim();
      if (!configured) {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'OA people search is not configured.',
          'FAILED_PRECONDITION',
        );
      }
      let url: URL;
      try {
        url = new URL(configured);
      } catch {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'OA people search is not configured.',
          'FAILED_PRECONDITION',
        );
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'OA people search is not configured.',
          'FAILED_PRECONDITION',
        );
      }
      url.searchParams.set('fd_name', q);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof MeetingOaError) throw error;
        throw new MeetingOaError(
          'OA_TIMEOUT',
          'OA people search is temporarily unavailable.',
          'UNAVAILABLE',
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new MeetingOaError(
          'OA_TIMEOUT',
          'OA people search is temporarily unavailable.',
          'UNAVAILABLE',
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new MeetingOaError(
          'OA_UNKNOWN',
          'OA people search returned an invalid response.',
          'UNAVAILABLE',
        );
      }
      return extractRows(payload)
        .map(mapPerson)
        .filter((row): row is OaPerson => row !== null);
    },

    async getToken(_employeeNo: string): Promise<OaToken> {
      throw new MeetingOaError(
        'OA_TOKEN_CONTRACT_UNAVAILABLE',
        TOKEN_CONTRACT_MESSAGE,
        'UNAVAILABLE',
        'NONE',
      );
    },

    async createMeeting(
      _token: OaToken,
      _payload: FrozenOaPayload,
    ): Promise<OaCreateMeetingResult> {
      throw new MeetingOaError(
        'OA_WRITE_CONTRACT_UNAVAILABLE',
        WRITE_CONTRACT_MESSAGE,
        'UNAVAILABLE',
        'NONE',
      );
    },

    async uploadSummary(
      _token: OaToken,
      _payload: FrozenOaPayload,
      _externalMeetingId: string,
    ): Promise<OaUploadSummaryResult> {
      throw new MeetingOaError(
        'OA_WRITE_CONTRACT_UNAVAILABLE',
        WRITE_CONTRACT_MESSAGE,
        'UNAVAILABLE',
        'NONE',
      );
    },

    async createTaskByMeeting(
      _token: OaToken,
      _payload: FrozenOaPayload,
      _externalMeetingId: string,
    ): Promise<readonly OaTaskWriteResult[]> {
      throw new MeetingOaError(
        'OA_WRITE_CONTRACT_UNAVAILABLE',
        WRITE_CONTRACT_MESSAGE,
        'UNAVAILABLE',
        'NONE',
      );
    },
  };
}

export const OA_WRITE_CONTRACT_MESSAGE = WRITE_CONTRACT_MESSAGE;
export const OA_TOKEN_CONTRACT_MESSAGE = TOKEN_CONTRACT_MESSAGE;
export { MIN_QUERY_LENGTH, mapPerson, extractRows };
