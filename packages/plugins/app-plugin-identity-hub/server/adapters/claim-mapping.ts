import type { ExternalIdentityClaims } from '../admission.js';

/** Where each logical field lives in an attribute bag, as dotted paths. */
export interface ClaimMapping {
  readonly email?: string;
  readonly emailVerified?: string;
  readonly name?: string;
  readonly organization?: string;
  readonly groups?: string;
  readonly employeeNo?: string;
}

/** Usual attribute names. A provider's `claimMapping` overrides any of them. */
export const DEFAULT_CLAIM_MAPPING: Required<ClaimMapping> = {
  email: 'email',
  emailVerified: 'email_verified',
  name: 'displayName',
  organization: 'owner',
  groups: 'groups',
  employeeNo: 'employeeNo',
};

/** Reads a dotted path such as `properties.department` from an attribute bag. */
export function readClaim(
  attributes: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  let current: unknown = attributes;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
  }
  if (typeof value === 'string' && value !== '') return [value];
  return [];
}

/**
 * Builds verified claims from an attribute bag. `emailVerified` is only `true` when the
 * source states it as the boolean `true`.
 */
export function extractIdentity(
  issuer: string,
  subject: string,
  attributes: Readonly<Record<string, unknown>>,
  mapping: ClaimMapping = {},
): ExternalIdentityClaims {
  const paths = { ...DEFAULT_CLAIM_MAPPING, ...mapping };
  const email = asStrings(readClaim(attributes, paths.email))[0];
  const name =
    asStrings(readClaim(attributes, paths.name))[0] ??
    asStrings(readClaim(attributes, 'name'))[0];
  const organization = asStrings(readClaim(attributes, paths.organization))[0];
  const employeeNo =
    asStrings(readClaim(attributes, paths.employeeNo))[0] ??
    asStrings(readClaim(attributes, 'properties.employeeNo'))[0];
  return {
    issuer,
    subject,
    ...(email ? { email: email.toLowerCase() } : {}),
    emailVerified: readClaim(attributes, paths.emailVerified) === true,
    ...(name ? { name } : {}),
    ...(organization ? { organization } : {}),
    ...(employeeNo ? { employeeNo: employeeNo.trim() } : {}),
    groups: asStrings(readClaim(attributes, paths.groups)),
    attributes,
  };
}

/** The values a mapping rule's `claim` resolves to for an identity. */
export function claimValues(
  identity: ExternalIdentityClaims,
  claim: string,
): string[] {
  if (claim === 'organization') {
    return identity.organization ? [identity.organization] : [];
  }
  if (claim === 'groups') return [...identity.groups];
  return asStrings(readClaim(identity.attributes, claim));
}

const mappingKeys = [
  'email',
  'emailVerified',
  'name',
  'organization',
  'groups',
  'employeeNo',
] as const;

export function claimMappingFrom(
  value: Readonly<Record<string, unknown>> | null | undefined,
): ClaimMapping {
  if (!value) return {};
  const mapping: {
    -readonly [Key in keyof ClaimMapping]?: ClaimMapping[Key];
  } = {};
  for (const key of mappingKeys) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) mapping[key] = item.trim();
  }
  return mapping;
}
