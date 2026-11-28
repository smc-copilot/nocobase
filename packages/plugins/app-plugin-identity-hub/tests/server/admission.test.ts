import { describe, expect, it } from 'vitest';

import {
  evaluateAdmission,
  type ExternalIdentityClaims,
} from '../../server/admission.js';

const user = (
  patch: Partial<ExternalIdentityClaims> = {},
): ExternalIdentityClaims => ({
  issuer: 'https://idp.example',
  subject: 'sub-1',
  emailVerified: false,
  groups: [],
  attributes: {},
  ...patch,
});

describe('evaluateAdmission', () => {
  it('admits nobody when the policy is missing or has no allow list', () => {
    expect(evaluateAdmission(undefined, user())).toEqual({
      allowed: false,
      reason: 'NOT_CONFIGURED',
    });
    expect(evaluateAdmission({}, user())).toMatchObject({ allowed: false });
  });

  it('lets a deny rule win and ignores an unverified email allowlist', () => {
    expect(
      evaluateAdmission(
        { denySubjects: ['sub-1'], allowSubjects: ['sub-1'] },
        user(),
      ),
    ).toMatchObject({ allowed: false, reason: 'DENIED_BY_RULE' });
    expect(
      evaluateAdmission(
        { allowEmails: ['ada@example.com'] },
        user({ email: 'ada@example.com', emailVerified: false }),
      ),
    ).toMatchObject({ allowed: false, reason: 'NOT_ALLOWLISTED' });
    expect(
      evaluateAdmission(
        { allowEmails: ['ada@example.com'] },
        user({ email: 'ada@example.com', emailVerified: true }),
      ),
    ).toEqual({ allowed: true, matched: 'allowEmails' });
  });
});
