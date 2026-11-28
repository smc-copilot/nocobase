import { ApiError } from '@nocobase/app-server/router';

import { hubError } from '../errors.js';
import type {
  AuthenticationInput,
  ProviderCapabilities,
  ProviderHealth,
} from './types.js';

export function capabilities(
  partial: Partial<ProviderCapabilities>,
): ProviderCapabilities {
  return {
    authenticate: false,
    resolveIdentity: false,
    directoryRead: false,
    groupRead: false,
    organizationRead: false,
    statusRead: false,
    userInfo: false,
    credentialLifecycle: false,
    ...partial,
  };
}

export function notConfigured(what: string): ApiError {
  return hubError(
    'FAILED_PRECONDITION',
    'IDENTITY_HUB_ADAPTER_NOT_CONFIGURED',
    `${what} is not configured.`,
  );
}

export function healthResult(
  ok: boolean,
  now: () => Date,
  detail?: string | null,
): ProviderHealth {
  return {
    ok,
    checkedAt: now().toISOString(),
    detail: detail ?? null,
  };
}

export function readConfigString(
  record: Readonly<Record<string, unknown>> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function assertMatchingState(input: AuthenticationInput): void {
  if (!input.expectedState || input.state !== input.expectedState) {
    throw hubError(
      'INVALID_ARGUMENT',
      'IDENTITY_HUB_STATE_MISMATCH',
      'The OAuth state does not match the expected state.',
    );
  }
}

/** Strips a trailing slash and lowercases the issuer. The subject is not rewritten. */
export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/u, '').toLowerCase();
}

export function oidcIdentityKey(issuer: string, subject: string): string {
  return `${normalizeIssuer(issuer)}|${subject.trim()}`;
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * LDAP's stable id is objectGUID, then entryUUID. A distinguished name is never the key.
 */
export function ldapStableId(
  attributes: Readonly<Record<string, unknown>>,
  dn?: string,
): string | undefined {
  const stable =
    firstString(attributes.objectGUID, attributes.objectGuid) ??
    firstString(attributes.entryUUID, attributes.entryUuid);
  if (!stable) return undefined;
  if (dn && stable === dn) return undefined;
  return stable;
}
