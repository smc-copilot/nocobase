import { ApiError } from '@nocobase/app-server/router';

export type MeetingGatewayReason =
  | 'ACCESS_DENIED'
  | 'AUTH_REQUIRED'
  | 'GATEWAY_REAUTH_REQUIRED'
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE'
  | 'UPSTREAM_CONTRACT_ERROR'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_STATE_EXPIRED'
  | 'OAUTH_STATE_REPLAYED'
  | 'OAUTH_ALREADY_PENDING'
  | 'CONNECTION_NOT_ALLOWED'
  | 'QUERY_WINDOW_INVALID'
  | 'QUERY_IN_PROGRESS'
  | 'SOURCE_NOT_IMPORTABLE';

export class MeetingGatewayError extends Error {
  constructor(
    readonly reason: MeetingGatewayReason,
    message: string,
    readonly status:
      | 'UNAUTHENTICATED'
      | 'PERMISSION_DENIED'
      | 'FAILED_PRECONDITION'
      | 'INVALID_ARGUMENT'
      | 'UNAVAILABLE'
      | 'ALREADY_EXISTS' = 'FAILED_PRECONDITION',
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'MeetingGatewayError';
  }

  toApiError(): ApiError {
    return new ApiError({
      status: this.status,
      reason: this.reason,
      domain: 'meetings',
      message: this.message,
    });
  }
}

export function asMeetingApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof MeetingGatewayError) return error.toApiError();
  return new ApiError({
    status: 'UNAVAILABLE',
    reason: 'UPSTREAM_CONTRACT_ERROR',
    domain: 'meetings',
    message: 'The meeting gateway request could not be completed.',
  });
}

export function meetingsForbidden(): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: 'meetings',
    message: 'This meeting is unavailable.',
  });
}
