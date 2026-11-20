import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

import { OA_SSO_ERROR_CODES } from '../../meetings/oa/sso-errors.js';
import { readNamedCookie } from '../../meetings/oa/sso-cookie.js';
import { normalizeEmployeeNo } from '../../meetings/oa/sso-normalize.js';
import { isMeetingOaSsoReady } from '../../meetings/oa/sso-validator.js';
import { getMeetingOaSsoRuntime } from './runtime.js';

const SIGN_IN_PATH = '/sign-in/oa-ltpa';

function isServiceKind(kind: string | null | undefined): boolean {
  return kind === 'service';
}

/**
 * Better Auth plugin: POST /api/auth/sign-in/oa-ltpa
 * Verifies the OA session cookie server-side, matches username, issues a Meeting session.
 */
export function oaLtpaAuth(): BetterAuthPlugin {
  return {
    id: 'meeting-oa-ltpa',
    endpoints: {
      signInWithOaLtpa: createAuthEndpoint(
        SIGN_IN_PATH,
        {
          method: 'POST',
          requireRequest: true,
          metadata: { noStore: true },
        },
        async (context) => {
          const runtime = getMeetingOaSsoRuntime();
          const config = runtime.resolveConfig();
          if (!isMeetingOaSsoReady(config)) {
            runtime.audit({ result: 'not_enabled' });
            throw new APIError('NOT_FOUND', {
              code: OA_SSO_ERROR_CODES.OA_SSO_NOT_ENABLED,
              message: 'OA single sign-on is not enabled.',
            });
          }

          const originHeader =
            context.request.headers.get('origin') ??
            context.request.headers.get('referer');
          if (!originHeader) {
            runtime.audit({
              result: 'invalid_origin',
              reason: 'missing_origin',
            });
            throw new APIError('FORBIDDEN', {
              code: 'INVALID_ORIGIN',
              message: 'The request origin is not allowed.',
            });
          }

          const cookieName = config.cookieName.trim();
          const cookie = readNamedCookie(
            context.request.headers.get('cookie'),
            cookieName,
          );
          if (cookie.kind === 'ambiguous') {
            runtime.audit({
              result: 'invalid_request',
              reason: 'ambiguous_cookie',
            });
            throw new APIError('BAD_REQUEST', {
              code: OA_SSO_ERROR_CODES.INVALID_SSO_REQUEST,
              message: 'The OA session cookie is ambiguous.',
            });
          }
          if (cookie.kind === 'missing') {
            runtime.audit({ result: 'session_required' });
            throw new APIError('UNAUTHORIZED', {
              code: OA_SSO_ERROR_CODES.OA_SESSION_REQUIRED,
              message: 'Sign in to OA in this browser, or use a password.',
            });
          }

          const validator = runtime.resolveValidator();
          if (!validator) {
            runtime.audit({
              result: 'unavailable',
              reason: 'validator_missing',
            });
            throw new APIError('SERVICE_UNAVAILABLE', {
              code: OA_SSO_ERROR_CODES.OA_VALIDATION_UNAVAILABLE,
              message: 'OA login is temporarily unavailable.',
            });
          }

          const oaStarted = Date.now();
          const validation = await validator.validate({
            cookieName,
            cookieValue: cookie.value,
          });
          const oaElapsedMs = Date.now() - oaStarted;

          if (validation.kind === 'rejected') {
            runtime.audit({
              result: 'rejected',
              reason: validation.detail,
              oaElapsedMs,
            });
            throw new APIError('UNAUTHORIZED', {
              code: OA_SSO_ERROR_CODES.OA_SESSION_INVALID,
              message: 'The OA login has expired. Sign in to OA again.',
            });
          }
          if (validation.kind === 'unavailable') {
            runtime.audit({
              result: 'unavailable',
              reason: validation.detail,
              oaElapsedMs,
            });
            throw new APIError('SERVICE_UNAVAILABLE', {
              code: OA_SSO_ERROR_CODES.OA_VALIDATION_UNAVAILABLE,
              message:
                'OA login is temporarily unavailable. The OA validate call failed.',
              detail: validation.detail,
            });
          }
          if (validation.kind === 'contract_error') {
            runtime.audit({
              result: 'contract_error',
              reason: validation.detail,
              oaElapsedMs,
            });
            throw new APIError('BAD_GATEWAY', {
              code: OA_SSO_ERROR_CODES.OA_CONTRACT_ERROR,
              message:
                'OA login is temporarily unavailable. The OA validate response was unexpected.',
              detail: validation.detail,
            });
          }

          const employeeNo = validation.employeeNo;
          if (!normalizeEmployeeNo(employeeNo)) {
            runtime.audit({
              result: 'contract_error',
              reason: 'empty_employee_no',
              oaElapsedMs,
            });
            throw new APIError('BAD_GATEWAY', {
              code: OA_SSO_ERROR_CODES.OA_CONTRACT_ERROR,
              message: 'OA login is temporarily unavailable.',
            });
          }

          const matches = await runtime.findUsersByEmployeeNo(employeeNo);
          if (matches.length !== 1) {
            runtime.audit({
              result: 'account_unavailable',
              reason: matches.length === 0 ? 'not_found' : 'ambiguous',
              oaElapsedMs,
            });
            throw new APIError('FORBIDDEN', {
              code: OA_SSO_ERROR_CODES.MEETING_ACCOUNT_UNAVAILABLE,
              message:
                'This OA account cannot sign in to Meeting. Contact an administrator.',
            });
          }

          const matched = matches[0];
          if (
            matched.disabledAt != null ||
            matched.deletedAt != null ||
            isServiceKind(matched.kind)
          ) {
            runtime.audit({
              result: 'account_unavailable',
              reason: isServiceKind(matched.kind) ? 'service' : 'disabled',
              userId: matched.id,
              oaElapsedMs,
            });
            throw new APIError('FORBIDDEN', {
              code: OA_SSO_ERROR_CODES.MEETING_ACCOUNT_UNAVAILABLE,
              message:
                'This OA account cannot sign in to Meeting. Contact an administrator.',
            });
          }

          const existing = await getSessionFromCtx(context, {
            disableCookieCache: true,
          }).catch(() => null);

          if (existing?.user?.id && existing.user.id !== matched.id) {
            runtime.audit({
              result: 'session_conflict',
              userId: existing.user.id,
              oaElapsedMs,
            });
            throw new APIError('CONFLICT', {
              code: OA_SSO_ERROR_CODES.SESSION_CONFLICT,
              message:
                'Sign out of the current Meeting account before using OA login.',
            });
          }

          if (existing?.user?.id === matched.id && existing.session) {
            runtime.audit({
              result: 'reused',
              userId: matched.id,
              oaElapsedMs,
            });
            return context.json({
              user: existing.user,
              session: existing.session,
            });
          }

          const user = await context.context.internalAdapter.findUserById(
            matched.id,
          );
          if (!user || Reflect.get(user, 'deletedAt') != null) {
            runtime.audit({
              result: 'account_unavailable',
              reason: 'missing_after_lookup',
              userId: matched.id,
              oaElapsedMs,
            });
            throw new APIError('FORBIDDEN', {
              code: OA_SSO_ERROR_CODES.MEETING_ACCOUNT_UNAVAILABLE,
              message:
                'This OA account cannot sign in to Meeting. Contact an administrator.',
            });
          }

          const session = await context.context.internalAdapter.createSession(
            user.id,
            true,
          );
          if (!session) {
            runtime.audit({
              result: 'session_failed',
              userId: user.id,
              oaElapsedMs,
            });
            throw new APIError('INTERNAL_SERVER_ERROR', {
              code: OA_SSO_ERROR_CODES.MEETING_SESSION_FAILED,
              message: 'Could not complete Meeting sign-in.',
            });
          }

          await setSessionCookie(context, { session, user }, true);
          runtime.audit({
            result: 'signed_in',
            userId: user.id,
            oaElapsedMs,
          });
          return context.json({ user, session });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path === SIGN_IN_PATH,
        window: 60,
        max: 5,
      },
    ],
    $ERROR_CODES: {
      [OA_SSO_ERROR_CODES.OA_SESSION_REQUIRED]: {
        code: OA_SSO_ERROR_CODES.OA_SESSION_REQUIRED,
        message: 'Sign in to OA in this browser, or use a password.',
      },
      [OA_SSO_ERROR_CODES.OA_SESSION_INVALID]: {
        code: OA_SSO_ERROR_CODES.OA_SESSION_INVALID,
        message: 'The OA login has expired. Sign in to OA again.',
      },
      [OA_SSO_ERROR_CODES.INVALID_SSO_REQUEST]: {
        code: OA_SSO_ERROR_CODES.INVALID_SSO_REQUEST,
        message: 'The OA sign-in request is invalid.',
      },
      [OA_SSO_ERROR_CODES.MEETING_ACCOUNT_UNAVAILABLE]: {
        code: OA_SSO_ERROR_CODES.MEETING_ACCOUNT_UNAVAILABLE,
        message:
          'This OA account cannot sign in to Meeting. Contact an administrator.',
      },
      [OA_SSO_ERROR_CODES.SESSION_CONFLICT]: {
        code: OA_SSO_ERROR_CODES.SESSION_CONFLICT,
        message:
          'Sign out of the current Meeting account before using OA login.',
      },
      [OA_SSO_ERROR_CODES.OA_CONTRACT_ERROR]: {
        code: OA_SSO_ERROR_CODES.OA_CONTRACT_ERROR,
        message: 'OA login is temporarily unavailable.',
      },
      [OA_SSO_ERROR_CODES.OA_VALIDATION_UNAVAILABLE]: {
        code: OA_SSO_ERROR_CODES.OA_VALIDATION_UNAVAILABLE,
        message: 'OA login is temporarily unavailable.',
      },
      [OA_SSO_ERROR_CODES.OA_SSO_NOT_ENABLED]: {
        code: OA_SSO_ERROR_CODES.OA_SSO_NOT_ENABLED,
        message: 'OA single sign-on is not enabled.',
      },
      [OA_SSO_ERROR_CODES.MEETING_SESSION_FAILED]: {
        code: OA_SSO_ERROR_CODES.MEETING_SESSION_FAILED,
        message: 'Could not complete Meeting sign-in.',
      },
    },
  };
}
