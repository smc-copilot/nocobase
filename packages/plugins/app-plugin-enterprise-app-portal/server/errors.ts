import { ApiError } from '@nocobase/app-server/router';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { ERROR_DOMAIN } from './config.js';

export function portalError(
  status: ConstructorParameters<typeof ApiError>[0]['status'],
  reason: string,
  message: string,
  metadata?: Record<string, unknown>,
  httpStatus?: ContentfulStatusCode,
): ApiError {
  return new ApiError({
    status,
    reason,
    domain: ERROR_DOMAIN,
    message,
    ...(metadata ? { metadata } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  });
}
