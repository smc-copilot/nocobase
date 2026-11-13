import { describe, expect, it } from 'vitest';

import {
  evaluateAdmission,
  isAdmissionConfigured,
} from '../../server/identity/admission.js';
import { extractIdentity } from '../../server/identity/claims.js';

const identity = (attributes: Record<string, unknown>) =>
  extractIdentity('https://casdoor.test.local', 'sub-1', attributes);

describe('admission policy (IAM-003)', () => {
  it('admits nobody when no policy or no allow entry is configured', () => {
    const user = identity({
      owner: 'acme',
      email: 'a@acme.test',
      email_verified: true,
    });
    expect(evaluateAdmission(undefined, user)).toEqual({
      allowed: false,
      reason: 'NOT_CONFIGURED',
    });
    expect(evaluateAdmission({}, user)).toMatchObject({ allowed: false });
    expect(
      evaluateAdmission({ denyOrganizations: ['evil'] }, user),
    ).toMatchObject({
      allowed: false,
      reason: 'NOT_CONFIGURED',
    });
    expect(isAdmissionConfigured({ allowOrganizations: [] })).toBe(false);
  });

  it('admits by organization, group, subject, or verified e-mail', () => {
    expect(
      evaluateAdmission(
        { allowOrganizations: ['ACME'] },
        identity({ owner: 'acme' }),
      ),
    ).toMatchObject({ allowed: true, matched: 'allowOrganizations' });
    expect(
      evaluateAdmission(
        { allowGroups: ['staff'] },
        identity({ groups: ['staff'] }),
      ),
    ).toMatchObject({ allowed: true, matched: 'allowGroups' });
    expect(
      evaluateAdmission({ allowSubjects: ['sub-1'] }, identity({})),
    ).toMatchObject({ allowed: true, matched: 'allowSubjects' });
    expect(
      evaluateAdmission(
        { allowEmailDomains: ['acme.test'] },
        identity({ email: 'a@acme.test', email_verified: true }),
      ),
    ).toMatchObject({ allowed: true, matched: 'allowEmailDomains' });
  });

  it('never trusts an unverified e-mail address', () => {
    const unverified = identity({
      email: 'a@acme.test',
      email_verified: 'true',
    });
    expect(unverified.emailVerified).toBe(false);
    expect(
      evaluateAdmission(
        { allowEmails: ['a@acme.test'], allowEmailDomains: ['acme.test'] },
        unverified,
      ),
    ).toEqual({ allowed: false, reason: 'NOT_ALLOWLISTED' });
  });

  it('lets a deny rule win over an allow rule', () => {
    expect(
      evaluateAdmission(
        { allowOrganizations: ['acme'], denySubjects: ['sub-1'] },
        identity({ owner: 'acme' }),
      ),
    ).toMatchObject({ allowed: false, reason: 'DENIED_BY_RULE' });
    expect(
      evaluateAdmission(
        { allowOrganizations: ['acme'], denyGroups: ['contractors'] },
        identity({ owner: 'acme', groups: ['contractors'] }),
      ),
    ).toMatchObject({ allowed: false, reason: 'DENIED_BY_RULE' });
  });
});
