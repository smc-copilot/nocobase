import type { AdmissionPolicy, ExternalIdentityClaims } from './model.js';

export type AdmissionDecision =
  | { readonly allowed: true; readonly matched: string }
  | {
      readonly allowed: false;
      readonly reason: 'NOT_CONFIGURED' | 'DENIED_BY_RULE' | 'NOT_ALLOWLISTED';
      readonly matched?: string;
    };

const allowLists = [
  'allowOrganizations',
  'allowGroups',
  'allowEmails',
  'allowEmailDomains',
  'allowSubjects',
] as const;

function lower(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim().toLowerCase());
}

/** Whether a policy can admit anybody at all. */
export function isAdmissionConfigured(
  policy: AdmissionPolicy | undefined,
): boolean {
  return !!policy && allowLists.some((key) => (policy[key]?.length ?? 0) > 0);
}

/**
 * Decides admission from verified attributes only. Deny rules win; an e-mail allowlist entry
 * counts only for a verified e-mail address; an unconfigured policy admits nobody.
 */
export function evaluateAdmission(
  policy: AdmissionPolicy | undefined,
  identity: ExternalIdentityClaims,
): AdmissionDecision {
  if (!policy || !isAdmissionConfigured(policy)) {
    return { allowed: false, reason: 'NOT_CONFIGURED' };
  }
  const organization = identity.organization?.toLowerCase();
  const groups = identity.groups.map((group) => group.toLowerCase());
  const subject = identity.subject.toLowerCase();

  if (lower(policy.denySubjects).includes(subject)) {
    return {
      allowed: false,
      reason: 'DENIED_BY_RULE',
      matched: 'denySubjects',
    };
  }
  if (organization && lower(policy.denyOrganizations).includes(organization)) {
    return {
      allowed: false,
      reason: 'DENIED_BY_RULE',
      matched: 'denyOrganizations',
    };
  }
  if (groups.some((group) => lower(policy.denyGroups).includes(group))) {
    return { allowed: false, reason: 'DENIED_BY_RULE', matched: 'denyGroups' };
  }

  if (lower(policy.allowSubjects).includes(subject)) {
    return { allowed: true, matched: 'allowSubjects' };
  }
  if (organization && lower(policy.allowOrganizations).includes(organization)) {
    return { allowed: true, matched: 'allowOrganizations' };
  }
  if (groups.some((group) => lower(policy.allowGroups).includes(group))) {
    return { allowed: true, matched: 'allowGroups' };
  }
  if (identity.email && identity.emailVerified) {
    if (lower(policy.allowEmails).includes(identity.email)) {
      return { allowed: true, matched: 'allowEmails' };
    }
    const domain = identity.email.split('@')[1];
    if (domain && lower(policy.allowEmailDomains).includes(domain)) {
      return { allowed: true, matched: 'allowEmailDomains' };
    }
  }
  return { allowed: false, reason: 'NOT_ALLOWLISTED' };
}
