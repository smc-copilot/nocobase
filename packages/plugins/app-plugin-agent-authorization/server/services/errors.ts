import { ApiError } from '@nocobase/app-server/router';

import { ERROR_DOMAIN } from '../config.js';

export function oauthError(
  reason:
    | 'INVALID_CLIENT'
    | 'INVALID_GRANT'
    | 'INVALID_REQUEST'
    | 'UNAUTHORIZED_CLIENT'
    | 'ACCESS_DENIED'
    | 'INVALID_SCOPE'
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED',
  message: string,
  status:
    | 'UNAUTHENTICATED'
    | 'PERMISSION_DENIED'
    | 'INVALID_ARGUMENT'
    | 'NOT_FOUND'
    | 'FAILED_PRECONDITION' = 'INVALID_ARGUMENT',
): ApiError {
  return new ApiError({
    status,
    reason,
    domain: ERROR_DOMAIN,
    message,
  });
}
