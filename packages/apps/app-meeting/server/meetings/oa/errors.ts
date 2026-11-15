import { ApiError } from '@nocobase/app-server/router';

export type MeetingOaReason =
  | 'ACCESS_DENIED'
  | 'AUTH_REQUIRED'
  | 'OA_NOT_CONFIGURED'
  | 'OA_MAPPING_MISSING'
  | 'OA_DELEGATION_DENIED'
  | 'OA_SYNC_DENIED'
  | 'OA_WRITE_CONTRACT_UNAVAILABLE'
  | 'OA_TOKEN_CONTRACT_UNAVAILABLE'
  | 'OA_BUSINESS_REJECTED'
  | 'OA_TIMEOUT'
  | 'OA_LOST_RESPONSE'
  | 'OA_UNKNOWN'
  | 'OA_INTENT_EXISTS'
  | 'OA_OPERATION_IMMUTABLE'
  | 'OA_SYNC_IN_PROGRESS'
  | 'OA_SYNC_COMPLETE'
  | 'OA_RESULT_UNKNOWN'
  | 'OA_DRAFT_INVALID'
  | 'OA_DRAFT_VERSION_CONFLICT'
  | 'OA_STEP_NOT_RESUMABLE'
  | 'OA_RECONCILE_REQUIRED'
  | 'CONTENT_VERSION_CONFLICT'
  | 'IMPORT_CONTRACT_UNAVAILABLE'
  | 'IMPORT_FAILED'
  | 'IMPORT_RECORDING_REJECTED'
  | 'INVALID_OA_QUERY';

export type OaWriteOutcome = 'NONE' | 'UNKNOWN' | 'CONFIRMED_FAILURE';

export class MeetingOaError extends Error {
  constructor(
    readonly reason: MeetingOaReason,
    message: string,
    readonly status:
      | 'UNAUTHENTICATED'
      | 'PERMISSION_DENIED'
      | 'FAILED_PRECONDITION'
      | 'INVALID_ARGUMENT'
      | 'UNAVAILABLE'
      | 'ALREADY_EXISTS'
      | 'ABORTED' = 'FAILED_PRECONDITION',
    readonly writeOutcome: OaWriteOutcome = 'NONE',
  ) {
    super(message);
    this.name = 'MeetingOaError';
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

export function asMeetingOaApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof MeetingOaError) return error.toApiError();
  return new ApiError({
    status: 'UNAVAILABLE',
    reason: 'OA_UNKNOWN',
    domain: 'meetings',
    message: 'The meeting OA request could not be completed.',
  });
}
