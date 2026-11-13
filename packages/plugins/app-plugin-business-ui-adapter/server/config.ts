export const PROTOCOL = 'business-ui.v1';
export const SERVICE_NAME = 'smc-nocobase-adapter';
export const TICKET_TTL_SECONDS = 60;
export const OAUTH_CODE_TTL_SECONDS = 120;
export const EMBED_TTL_SECONDS = 3600;

/** Whitelisted handler keys; form registration rejects anything else. */
export const HANDLER_WHITELIST: ReadonlySet<string> = new Set([
  'generic-request',
]);

export const FORM_REFS: {
  readonly edit: 'generic.request.edit';
  readonly detail: 'generic.request.detail';
} = {
  edit: 'generic.request.edit',
  detail: 'generic.request.detail',
};

export const DOCUMENT_TYPE = 'generic.request';

export const CASDOOR_ACCESS_TOKEN_SCHEME = 'casdoorAccessToken';

export interface BusinessUiAdapterConfig {
  environment?: string;
  publicBaseUrl?: string;
  /** When true, save/submit may inject UNKNOWN before side effects (tests only). */
  faultInjection?: {
    unknownOnSubmit?: boolean;
  };
}
