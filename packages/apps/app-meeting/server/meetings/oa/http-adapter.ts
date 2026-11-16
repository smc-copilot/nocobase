import type { MeetingOaConfig } from '../../config/meeting-oa.js';
import type {
  FrozenOaPayload,
  MeetingOaAdapter,
  OaContractMode,
  OaCreateMeetingResult,
  OaPerson,
  OaTaskWriteResult,
  OaToken,
  OaUploadSummaryResult,
} from './adapter.js';
import { MeetingOaError } from './errors.js';
import {
  buildCreateMeetingBody,
  buildTaskAssignmentBody,
  buildUploadSummaryBody,
} from './oa-payload.js';

const MIN_QUERY_LENGTH = 2;

export interface OaHttpCredentials {
  readonly tokenUrl?: string;
  readonly meetingUrl?: string;
  readonly peopleUrl?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly scope?: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

export function mapPerson(row: unknown): OaPerson | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const fd_no = asText(record.fd_no || record.fdNo || record.id);
  const fd_name = asText(record.fd_name || record.fdName || record.name);
  const fd_department = asText(
    record.fd_department || record.fdDepartment || record.department,
  );
  if (!fd_no || !fd_name) return null;
  return { fd_no, fd_name, fd_department };
}

export function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'people', 'result', 'results', 'rows', 'list']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function assertSafeUrl(value: string, allowHttpLoopback: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MeetingOaError(
      'OA_NOT_CONFIGURED',
      'OA URL is not configured.',
      'FAILED_PRECONDITION',
    );
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  const okProtocol =
    url.protocol === 'https:' ||
    (allowHttpLoopback && url.protocol === 'http:' && loopback);
  if (!okProtocol || url.username || url.password) {
    throw new MeetingOaError(
      'OA_NOT_CONFIGURED',
      'OA URL is not configured.',
      'FAILED_PRECONDITION',
    );
  }
  return url;
}

export function createHttpMeetingOaAdapter(options: {
  config: MeetingOaConfig;
  fetchImpl?: typeof fetch;
  resolvePeopleUrl?: () => Promise<string | undefined>;
  resolveCredentials?: () => Promise<OaHttpCredentials>;
}): MeetingOaAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeout = Math.min(
    Math.max(Number(options.config.timeoutMs) || 15_000, 1),
    30_000,
  );
  const allowHttpLoopback = options.config.testAdapter === true;
  const tokenCache = new Map<
    string,
    { token: OaToken; refreshAt: number; pending?: Promise<OaToken> }
  >();

  async function credentials(): Promise<OaHttpCredentials> {
    const stored = (await options.resolveCredentials?.()) ?? {};
    return {
      tokenUrl: stored.tokenUrl || options.config.tokenUrl,
      meetingUrl: stored.meetingUrl || options.config.meetingUrl,
      peopleUrl:
        stored.peopleUrl ||
        (await options.resolvePeopleUrl?.()) ||
        options.config.peopleUrl,
      clientId: stored.clientId || options.config.clientId,
      clientSecret: stored.clientSecret || options.config.clientSecret,
      scope: stored.scope || options.config.scope,
    };
  }

  function mode(ready: boolean): OaContractMode {
    return ready ? 'configured' : 'unavailable';
  }

  async function postOa(input: {
    url: string;
    token: string;
    method: string;
    body: unknown;
    unknownMessage: string;
  }): Promise<{ response: Response; result: Record<string, unknown> | null }> {
    const endpoint = assertSafeUrl(input.url, allowHttpLoopback);
    endpoint.searchParams.set('method', input.method);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.body),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new MeetingOaError(
        'OA_UNKNOWN',
        input.unknownMessage,
        'UNAVAILABLE',
        'UNKNOWN',
      );
    } finally {
      clearTimeout(timer);
    }
    let result: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        result = parsed as Record<string, unknown>;
      }
    } catch {
      result = null;
    }
    return { response, result };
  }

  return {
    kind: 'http',
    get writeContract() {
      return mode(Boolean(options.config.meetingUrl));
    },
    get tokenContract() {
      return mode(Boolean(options.config.tokenUrl && options.config.clientId));
    },

    async searchPeople(query: string): Promise<readonly OaPerson[]> {
      const q = query.trim();
      if (q.length < MIN_QUERY_LENGTH) {
        throw new MeetingOaError(
          'INVALID_OA_QUERY',
          `OA people query must be at least ${String(MIN_QUERY_LENGTH)} characters`,
          'INVALID_ARGUMENT',
        );
      }
      const configured = (await credentials()).peopleUrl?.trim();
      if (!configured) {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'OA people search is not configured.',
          'FAILED_PRECONDITION',
        );
      }
      const url = assertSafeUrl(configured, allowHttpLoopback);
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
      } catch {
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

    async getToken(employeeNo: string): Promise<OaToken> {
      const key = employeeNo.trim();
      if (!key) {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'Employee number is required.',
          'INVALID_ARGUMENT',
        );
      }
      const conf = await credentials();
      if (!conf.tokenUrl || !conf.clientId || !conf.clientSecret) {
        throw new MeetingOaError(
          'OA_NOT_CONFIGURED',
          'OA token URL, client id and secret are required before a token can be fetched.',
          'FAILED_PRECONDITION',
          'NONE',
        );
      }
      const cached = tokenCache.get(key);
      if (cached && cached.refreshAt > Date.now()) return cached.token;
      if (cached?.pending) return cached.pending;
      const pending = (async () => {
        const endpoint = assertSafeUrl(
          conf.tokenUrl as string,
          allowHttpLoopback,
        );
        endpoint.searchParams.set('method', 'token');
        endpoint.searchParams.set('grant_type', 'client_credentials');
        endpoint.searchParams.set('employee_no', key);
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          employee_no: key,
        });
        if (conf.scope) {
          endpoint.searchParams.set('scope', conf.scope);
          body.set('scope', conf.scope);
        }
        const basic = Buffer.from(
          `${conf.clientId}:${conf.clientSecret}`,
          'utf8',
        ).toString('base64');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${basic}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
            redirect: 'error',
            signal: controller.signal,
          });
        } catch {
          throw new MeetingOaError(
            'OA_TOKEN_CONTRACT_UNAVAILABLE',
            'OA authentication request failed.',
            'UNAVAILABLE',
            'NONE',
          );
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) {
          throw new MeetingOaError(
            'OA_TOKEN_CONTRACT_UNAVAILABLE',
            'OA authentication failed.',
            'UNAVAILABLE',
            'NONE',
          );
        }
        let token: Record<string, unknown>;
        try {
          token = (await response.json()) as Record<string, unknown>;
        } catch {
          throw new MeetingOaError(
            'OA_TOKEN_CONTRACT_UNAVAILABLE',
            'Invalid OA authentication response.',
            'UNAVAILABLE',
            'NONE',
          );
        }
        const accessToken = asText(token.access_token);
        const tokenType = asText(token.token_type).toLowerCase();
        const expiresIn = Number(token.expires_in);
        const returnedEmployee = asText(token.employee_no);
        if (
          !accessToken ||
          tokenType !== 'bearer' ||
          !Number.isFinite(expiresIn) ||
          expiresIn <= 0 ||
          returnedEmployee.toLowerCase() !== key.toLowerCase()
        ) {
          throw new MeetingOaError(
            'OA_TOKEN_CONTRACT_UNAVAILABLE',
            'Invalid OA authentication response.',
            'UNAVAILABLE',
            'NONE',
          );
        }
        const result: OaToken = {
          accessToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
        tokenCache.set(key, {
          token: result,
          refreshAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
        });
        return result;
      })();
      tokenCache.set(key, {
        token: { accessToken: '', expiresAt: '' },
        refreshAt: 0,
        pending,
      });
      try {
        return await pending;
      } finally {
        const row = tokenCache.get(key);
        if (row) delete row.pending;
      }
    },

    async createMeeting(
      token: OaToken,
      payload: FrozenOaPayload,
    ): Promise<OaCreateMeetingResult> {
      const conf = await credentials();
      if (!conf.meetingUrl) {
        throw new MeetingOaError(
          'OA_WRITE_CONTRACT_UNAVAILABLE',
          'OA meeting URL is not configured. Token URL is not used as the business address.',
          'FAILED_PRECONDITION',
          'NONE',
        );
      }
      const { response, result } = await postOa({
        url: conf.meetingUrl,
        token: token.accessToken,
        method: 'createMeeting',
        body: buildCreateMeetingBody(payload),
        unknownMessage:
          'OA meeting creation outcome is unknown; check OA before retrying',
      });
      const meetingId = asText(result?.meetingId);
      if (response.ok && String(result?.X_RETURN_CODE) === '200' && meetingId) {
        return { externalMeetingId: meetingId };
      }
      throw new MeetingOaError(
        meetingId ? 'OA_UNKNOWN' : 'OA_UNKNOWN',
        'OA meeting creation did not complete; check OA before retrying',
        'UNAVAILABLE',
        'UNKNOWN',
        meetingId ? { externalMeetingId: meetingId } : {},
      );
    },

    async uploadSummary(
      token: OaToken,
      payload: FrozenOaPayload,
      externalMeetingId: string,
    ): Promise<OaUploadSummaryResult> {
      const conf = await credentials();
      if (!conf.meetingUrl) {
        throw new MeetingOaError(
          'OA_WRITE_CONTRACT_UNAVAILABLE',
          'OA meeting URL is not configured.',
          'FAILED_PRECONDITION',
          'NONE',
        );
      }
      const { response, result } = await postOa({
        url: conf.meetingUrl,
        token: token.accessToken,
        method: 'uploadMeetingSummary',
        body: buildUploadSummaryBody(payload, externalMeetingId),
        unknownMessage:
          'OA summary upload outcome is unknown; check OA before retrying',
      });
      const summaryId = asText(result?.summaryId);
      const meetingId = asText(result?.meetingId) || externalMeetingId;
      if (meetingId && meetingId !== externalMeetingId && summaryId) {
        throw new MeetingOaError(
          'OA_UNKNOWN',
          'OA summary meetingId did not match the frozen meeting.',
          'UNAVAILABLE',
          'UNKNOWN',
          { externalSummaryId: summaryId, externalMeetingId: meetingId },
        );
      }
      if (response.ok && String(result?.X_RETURN_CODE) === '200' && summaryId) {
        return {
          uploaded: true,
          externalSummaryId: summaryId,
          externalMeetingId: meetingId,
        };
      }
      throw new MeetingOaError(
        'OA_UNKNOWN',
        'OA summary upload did not complete; check OA before retrying',
        'UNAVAILABLE',
        'UNKNOWN',
        summaryId
          ? { externalSummaryId: summaryId, externalMeetingId: meetingId }
          : {},
      );
    },

    async createTaskByMeeting(
      token: OaToken,
      payload: FrozenOaPayload,
      externalMeetingId: string,
    ): Promise<readonly OaTaskWriteResult[]> {
      const conf = await credentials();
      if (!conf.meetingUrl) {
        throw new MeetingOaError(
          'OA_WRITE_CONTRACT_UNAVAILABLE',
          'OA meeting URL is not configured.',
          'FAILED_PRECONDITION',
          'NONE',
        );
      }
      const { response, result } = await postOa({
        url: conf.meetingUrl,
        token: token.accessToken,
        method: 'createTaskByMeeting',
        body: buildTaskAssignmentBody(payload, externalMeetingId),
        unknownMessage:
          'OA task assignment outcome is unknown; check OA before retrying',
      });
      const list = Array.isArray(result?.list) ? result.list : [];
      const byName = new Map(payload.tasks.map((task) => [task.title, task]));
      const mapped: OaTaskWriteResult[] = [];
      const used = new Set<string>();
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const taskName = asText(row.task_name);
        const taskId = asText(row.task_id);
        const success = row.success === true;
        const match =
          payload.tasks.find(
            (task) => task.title === taskName && !used.has(task.clientTaskId),
          ) ?? byName.get(taskName);
        if (!match) continue;
        used.add(match.clientTaskId);
        mapped.push({
          clientTaskId: match.clientTaskId,
          status: success && taskId ? 'succeeded' : 'unknown',
          externalTaskId: taskId || null,
          errorCode: success && taskId ? null : 'OA_TASKS_UNKNOWN',
        });
      }
      const allSucceeded =
        response.ok &&
        String(result?.X_RETURN_CODE) === '200' &&
        list.length > 0 &&
        mapped.length === payload.tasks.length &&
        mapped.every((row) => row.status === 'succeeded');
      if (allSucceeded) return mapped;
      throw new MeetingOaError(
        'OA_UNKNOWN',
        'OA task assignment did not complete; check OA before retrying',
        'UNAVAILABLE',
        'UNKNOWN',
        {
          tasks: mapped.map((row) => ({
            clientTaskId: row.clientTaskId,
            taskId: row.externalTaskId ?? undefined,
          })),
        },
      );
    },
  };
}

export const OA_WRITE_CONTRACT_MESSAGE =
  'OA meeting URL is not configured. Token URL is not used as the business address.';
export const OA_TOKEN_CONTRACT_MESSAGE =
  'OA token URL, client id and secret are required before a token can be fetched.';
export { MIN_QUERY_LENGTH };
