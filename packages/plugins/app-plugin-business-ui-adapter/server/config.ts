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

export interface BusinessUiAdapterConfig {
  environment?: string;
  publicBaseUrl?: string;
  /**
   * Fault injection — production builds must leave this unset. Test harnesses may enable
   * one scenario at a time to prove UNKNOWN / FAILED recovery paths (FIX-12 / R42).
   */
  faultInjection?: {
    /** Persist UNKNOWN before any document write (response-lost before commit is a separate path). */
    unknownOnSubmit?: boolean;
    /** Fail before writing the document and mark the operation FAILED with safe_retry. */
    failBeforeWrite?: boolean;
    /**
     * NEXT-04 / N18: complete the commit and write a SUCCESS receipt, then drop the
     * client response and detach the receipt from the interaction so reconcile must
     * recover SUCCESS from the receipt by operation id.
     */
    loseSubmitResponse?: boolean;
  };
}

/** Authorization settings items for the adapter admin API (FIX-06 / FIX-08). */
export const SETTINGS_CONNECTIONS = 'businessUiAdapter.connections';
export const SETTINGS_FORMS = 'businessUiAdapter.forms';
export const SETTINGS_AUDIT = 'businessUiAdapter.audit';
