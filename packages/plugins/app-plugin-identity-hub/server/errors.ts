import { ApiError, type ApiErrorStatus } from '@nocobase/app-server/router';

export const ERROR_DOMAIN = 'identityHub';

export function hubError(
  status: ApiErrorStatus,
  reason: string,
  message: string,
  metadata?: Record<string, unknown>,
): ApiError {
  return new ApiError({
    status,
    reason,
    domain: ERROR_DOMAIN,
    message,
    ...(metadata ? { metadata } : {}),
  });
}
