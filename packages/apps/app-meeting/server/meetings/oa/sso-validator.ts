import type { MeetingOaSsoConfig } from '../../config/meeting-oa-sso.js';
import { normalizeEmployeeNo } from './sso-normalize.js';

export type OaSsoValidationResult =
  | { readonly kind: 'verified'; readonly employeeNo: string }
  | { readonly kind: 'rejected'; readonly detail?: string }
  | { readonly kind: 'unavailable'; readonly detail?: string }
  | { readonly kind: 'contract_error'; readonly detail?: string };

export interface OaSsoValidator {
  validate(input: {
    readonly cookieValue: string;
    readonly cookieName: string;
  }): Promise<OaSsoValidationResult>;
}

export function assertSafeValidateUrl(
  value: string,
  options: { readonly allowInsecureHttp?: boolean } = {},
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('OA SSO validate URL is not a valid URL.');
  }
  if (url.username || url.password) {
    throw new Error('OA SSO validate URL must not include credentials.');
  }
  const allowHttp =
    options.allowInsecureHttp === true && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !allowHttp) {
    throw new Error(
      'OA SSO validate URL must use HTTPS, or enable meetingOa.allowInsecureHttp for intranet http:// endpoints.',
    );
  }
  return url;
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

/**
 * Extracts the authoritative employee number from an OA validation response.
 * Field path is a candidate until PRE-04 locks the contract; loginName is preferred.
 */
export function parseOaLoginName(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? trimmed : null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const directKeys = [
    'loginName',
    'LoginName',
    'login_name',
    'fdLoginName',
    'fd_login_name',
    'employeeNo',
    'employee_no',
    'fd_no',
    'fdNo',
  ] as const;
  for (const key of directKeys) {
    const value = asText(record[key]).trim();
    if (value) return value;
  }
  for (const nestedKey of ['data', 'result', 'payload'] as const) {
    const nested = record[nestedKey];
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const found = parseOaLoginName(nested);
      if (found) return found;
    }
  }
  return null;
}

function isRejectedStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

/** Short, cookie-free OA failure label for audits and API messages. */
export function summarizeOaHttpFailure(status: number, body: string): string {
  const base = `http_${status}`;
  const trimmed = body.trim();
  if (!trimmed) return base;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const msg =
      typeof parsed.msg === 'string'
        ? parsed.msg
        : typeof parsed.message === 'string'
          ? parsed.message
          : typeof parsed.code === 'string'
            ? parsed.code
            : '';
    if (msg.trim()) {
      return `${base}:${msg.trim().slice(0, 120)}`;
    }
  } catch {
    // plain text
  }
  return `${base}:${trimmed.slice(0, 80).replace(/\s+/g, ' ')}`;
}

export function resolveOaSsoValidateMethod(
  value: string | undefined,
): 'GET' | 'POST' {
  return value?.trim().toUpperCase() === 'POST' ? 'POST' : 'GET';
}

export function isMeetingOaSsoReady(
  config: MeetingOaSsoConfig | undefined,
): boolean {
  if (!config?.enabled) return false;
  const url = config.validateUrl?.trim();
  if (!url) return false;
  try {
    assertSafeValidateUrl(url, {
      allowInsecureHttp: config.allowInsecureHttp === true,
    });
  } catch {
    return false;
  }
  return Boolean(config.cookieName?.trim());
}

let fetchImplForTests: typeof fetch | undefined;

/** Test-only: override the outbound fetch used when no per-call fetchImpl is passed. */
export function setOaSsoFetchForTests(fetchImpl?: typeof fetch): void {
  fetchImplForTests = fetchImpl;
}

export function createOaSsoValidator(options: {
  readonly config: MeetingOaSsoConfig;
  readonly fetchImpl?: typeof fetch;
}): OaSsoValidator {
  const fetchImpl =
    options.fetchImpl ?? fetchImplForTests ?? globalThis.fetch.bind(globalThis);
  const timeout = Math.min(
    Math.max(Number(options.config.timeoutMs) || 10_000, 1),
    30_000,
  );
  const method = resolveOaSsoValidateMethod(options.config.validateMethod);

  return {
    async validate(input) {
      let endpoint: URL;
      try {
        endpoint = assertSafeValidateUrl(options.config.validateUrl!.trim(), {
          allowInsecureHttp: options.config.allowInsecureHttp === true,
        });
      } catch {
        return { kind: 'contract_error', detail: 'invalid_validate_url' };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const started = Date.now();
      try {
        const response = await fetchImpl(endpoint, {
          method,
          headers: {
            Accept: 'application/json, text/plain;q=0.9,*/*;q=0.8',
            Cookie: `${input.cookieName}=${input.cookieValue}`,
          },
          redirect: 'error',
          signal: controller.signal,
        });
        const elapsedMs = Date.now() - started;
        void elapsedMs;

        if (response.type === 'opaqueredirect' || response.status === 0) {
          return { kind: 'contract_error', detail: 'redirect' };
        }
        const contentType = response.headers.get('content-type') ?? '';
        const raw = await response.text();

        if (isRejectedStatus(response.status)) {
          return { kind: 'rejected', detail: `http_${response.status}` };
        }
        if (response.status === 429 || response.status >= 500) {
          return {
            kind: 'unavailable',
            detail: summarizeOaHttpFailure(response.status, raw),
          };
        }
        if (response.status < 200 || response.status >= 300) {
          return {
            kind: 'contract_error',
            detail: summarizeOaHttpFailure(response.status, raw),
          };
        }

        let payload: unknown = raw;
        if (
          contentType.includes('application/json') ||
          raw.trim().startsWith('{') ||
          raw.trim().startsWith('[')
        ) {
          try {
            payload = JSON.parse(raw) as unknown;
          } catch {
            return { kind: 'contract_error', detail: 'invalid_json' };
          }
        } else if (contentType.includes('text/html')) {
          return { kind: 'contract_error', detail: 'html_body' };
        }

        const loginName = parseOaLoginName(payload);
        if (!loginName || !normalizeEmployeeNo(loginName)) {
          return { kind: 'contract_error', detail: 'missing_login_name' };
        }
        return { kind: 'verified', employeeNo: loginName };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError')
        ) {
          return { kind: 'unavailable', detail: 'timeout' };
        }
        if (
          error instanceof TypeError ||
          (error instanceof Error && /redirect/i.test(error.message))
        ) {
          const message = error instanceof Error ? error.message : '';
          if (/redirect/i.test(message)) {
            return { kind: 'contract_error', detail: 'redirect' };
          }
          return { kind: 'unavailable', detail: 'network' };
        }
        return { kind: 'unavailable', detail: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
