import type { ClaimMapping, ExternalIdentityClaims } from './model.js';

/** Casdoor's usual attribute names; a provider's `claimMapping` overrides any of them. */
export const DEFAULT_CLAIM_MAPPING: Required<ClaimMapping> = {
  email: 'email',
  emailVerified: 'email_verified',
  name: 'displayName',
  organization: 'owner',
  groups: 'groups',
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
 * Builds the verified identity from an attribute bag. `emailVerified` is only `true` when the
 * source states it as the boolean `true`: a missing or stringly-typed claim never counts.
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
  return {
    issuer,
    subject,
    ...(email ? { email: email.toLowerCase() } : {}),
    emailVerified: readClaim(attributes, paths.emailVerified) === true,
    ...(name ? { name } : {}),
    ...(organization ? { organization } : {}),
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
