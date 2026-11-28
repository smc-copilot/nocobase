export const PROVIDER_TYPES = [
  'manual',
  'ldap',
  'oidc',
  'oauth2',
  'casdoor',
  'oa-ltpa',
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PERSON_STATUSES = [
  'pending',
  'active',
  'disabled',
  'archived',
] as const;

export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const IDENTITY_STATUSES = [
  'active',
  'disabled',
  'pending',
  'unlinked',
] as const;

export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const MEMBERSHIP_STATUSES = [
  'invited',
  'active',
  'suspended',
  'revoked',
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const RECORD_STATUSES = ['active', 'disabled'] as const;

export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const CONFLICT_STATUSES = ['open', 'resolved', 'rejected'] as const;

export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export interface ActorContext {
  readonly actorId?: string | null;
  readonly requestId?: string | null;
}

export interface PageQuery {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export function isProviderType(value: string): value is ProviderType {
  return (PROVIDER_TYPES as readonly string[]).includes(value);
}

export function isPersonStatus(value: string): value is PersonStatus {
  return (PERSON_STATUSES as readonly string[]).includes(value);
}

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function isRecordStatus(value: string): value is RecordStatus {
  return (RECORD_STATUSES as readonly string[]).includes(value);
}

export function isConflictStatus(value: string): value is ConflictStatus {
  return (CONFLICT_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalized unique key for one external identity. An immutable external id wins;
 * otherwise the key is the issuer plus subject. Email is never part of the key.
 */
export function buildIdentityKey(input: {
  readonly issuer?: string | null;
  readonly subject: string;
  readonly externalId?: string | null;
}): string {
  const externalId = input.externalId?.trim().toLowerCase();
  if (externalId) return `ext:${externalId}`;
  const subject = input.subject.trim().toLowerCase();
  const issuer = input.issuer?.trim().toLowerCase();
  if (issuer) return `iss:${issuer}|sub:${subject}`;
  return `sub:${subject}`;
}

export function pageWindow(query: PageQuery = {}): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize =
    query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}
