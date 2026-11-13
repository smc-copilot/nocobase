export const ERROR_DOMAIN = 'businessUiAdapter';

export type ProtocolErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'PERMISSION_DENIED'
  | 'SUBJECT_BINDING_REQUIRED'
  | 'SUBJECT_MISMATCH'
  | 'FORM_NOT_REGISTERED'
  | 'TICKET_EXPIRED'
  | 'TICKET_REPLAYED'
  | 'VERSION_CONFLICT'
  | 'OPERATION_NOT_FOUND'
  | 'RETRY_NOT_SAFE'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_DISABLED'
  | 'INVALID_SERVICE_CREDENTIAL'
  | 'SESSION_CONFLICT'
  | 'EMBED_CONTEXT_REQUIRED'
  | 'UNSUPPORTED'
  | 'INVALID_ARGUMENT'
  | 'SECRETS_NOT_CONFIGURED';

export class ProtocolError extends Error {
  public readonly code: ProtocolErrorCode;
  public readonly status: number;

  constructor(code: ProtocolErrorCode, status: number, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    this.status = status;
  }
}

export function protocolErrorBody(error: ProtocolError): {
  error: {
    code: ProtocolErrorCode;
    status: number;
    reason: ProtocolErrorCode;
    domain: string;
    message: string;
  };
} {
  return {
    error: {
      code: error.code,
      status: error.status,
      reason: error.code,
      domain: ERROR_DOMAIN,
      message: error.message,
    },
  };
}
