import { MeetingOaError } from './errors.js';
import { employeeNosMatch } from './sso-normalize.js';
import { readNamedCookie } from './sso-cookie.js';
import type { OaSsoValidator } from './sso-validator.js';
import type { MeetingOaAdapter } from './adapter.js';

export type LiveVerifyReason =
  | 'sso_disabled'
  | 'cookie_missing'
  | 'cookie_ambiguous'
  | 'rejected'
  | 'unavailable'
  | 'contract_error'
  | 'username_missing'
  | 'username_mismatch'
  | 'oauth_not_configured'
  | 'verified';

export interface LiveSessionProbeResult {
  readonly liveVerified: boolean;
  readonly employeeNo: string | null;
  readonly reason: LiveVerifyReason;
}

/**
 * Proves the signed-in Meeting username can obtain an OA OAuth token
 * (client_credentials + employee_no = username). Used for OA workspace
 * liveVerified / formal sync gating.
 */
export async function probeLiveOaOAuth(input: {
  readonly username: string | null | undefined;
  readonly adapter: MeetingOaAdapter | undefined;
  readonly tokenConfigured: boolean;
}): Promise<LiveSessionProbeResult> {
  const username =
    typeof input.username === 'string' ? input.username.trim() : '';
  if (!username) {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'username_missing',
    };
  }
  if (!input.adapter || !input.tokenConfigured) {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'oauth_not_configured',
    };
  }
  try {
    await input.adapter.getToken(username);
    return {
      liveVerified: true,
      employeeNo: username,
      reason: 'verified',
    };
  } catch (error) {
    if (error instanceof MeetingOaError) {
      if (error.reason === 'OA_NOT_CONFIGURED') {
        return {
          liveVerified: false,
          employeeNo: null,
          reason: 'oauth_not_configured',
        };
      }
      if (error.reason === 'OA_TOKEN_CONTRACT_UNAVAILABLE') {
        const message = error.message.toLowerCase();
        if (message.includes('invalid oa authentication response')) {
          return {
            liveVerified: false,
            employeeNo: null,
            reason: 'contract_error',
          };
        }
        if (message.includes('authentication failed')) {
          return {
            liveVerified: false,
            employeeNo: null,
            reason: 'rejected',
          };
        }
        return {
          liveVerified: false,
          employeeNo: null,
          reason: 'unavailable',
        };
      }
    }
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'unavailable',
    };
  }
}

/**
 * Legacy cookie/Ltpa probe. Kept for SSO sign-in related tests; OA workspace
 * liveVerified uses {@link probeLiveOaOAuth}.
 */
export async function probeLiveOaSession(input: {
  readonly cookieHeader: string | null | undefined;
  readonly cookieName: string;
  readonly username: string | null | undefined;
  readonly validator: OaSsoValidator | undefined;
  readonly ssoEnabled: boolean;
}): Promise<LiveSessionProbeResult> {
  if (!input.ssoEnabled || !input.validator) {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'sso_disabled',
    };
  }
  const username =
    typeof input.username === 'string' ? input.username.trim() : '';
  if (!username) {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'username_missing',
    };
  }
  const cookie = readNamedCookie(input.cookieHeader, input.cookieName);
  if (cookie.kind === 'missing') {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'cookie_missing',
    };
  }
  if (cookie.kind === 'ambiguous') {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: 'cookie_ambiguous',
    };
  }
  const validation = await input.validator.validate({
    cookieName: input.cookieName,
    cookieValue: cookie.value,
  });
  if (validation.kind !== 'verified') {
    return {
      liveVerified: false,
      employeeNo: null,
      reason: validation.kind,
    };
  }
  if (!employeeNosMatch(username, validation.employeeNo)) {
    return {
      liveVerified: false,
      employeeNo: validation.employeeNo,
      reason: 'username_mismatch',
    };
  }
  return {
    liveVerified: true,
    employeeNo: validation.employeeNo,
    reason: 'verified',
  };
}

export function liveSessionDenyReason(
  reason: LiveVerifyReason,
): 'OA_LIVE_SESSION_REQUIRED' | 'OA_MAPPING_MISSING' {
  void reason;
  return 'OA_LIVE_SESSION_REQUIRED';
}
