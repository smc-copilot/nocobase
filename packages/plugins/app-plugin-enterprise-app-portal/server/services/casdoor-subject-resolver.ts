import type { DatabaseManager } from '@nocobase/db';

import { portalError } from '../errors.js';
import type { CasdoorManagementClient } from './casdoor-management-client.js';
import { str } from './values.js';

export interface ResolvedCasdoorSubject {
  readonly providerIssuer: string;
  readonly providerSubject: string;
  /** Subject string passed to Casdoor `/api/enforce`. */
  readonly casdoorUserId: string;
  readonly localUserId: string;
}

/**
 * Resolves a verified Casdoor Enforce subject from `externalIdentities`.
 * Never guesses from username/email/employee number.
 */
export class CasdoorSubjectResolver {
  constructor(
    private readonly database: () => DatabaseManager,
    private readonly issuer: () => string | undefined,
    private readonly client: () => CasdoorManagementClient | undefined,
  ) {}

  public async requireForUser(
    localUserId: string,
  ): Promise<ResolvedCasdoorSubject> {
    const issuer = this.issuer()?.trim();
    if (!issuer) {
      throw portalError(
        'FAILED_PRECONDITION',
        'IDENTITY_BINDING_REQUIRED',
        'Casdoor identity issuer is not configured for portal routing.',
      );
    }
    const rows = await this.database()
      .connection()
      .query.selectFrom('externalIdentities')
      .select(['providerIssuer', 'providerSubject', 'localUserId'])
      .where('localUserId', '=', localUserId)
      .where('providerIssuer', '=', issuer)
      .execute();
    if (rows.length === 0) {
      throw portalError(
        'PERMISSION_DENIED',
        'IDENTITY_BINDING_REQUIRED',
        'No Casdoor identity binding exists for this user.',
      );
    }
    const subjects = new Set(
      rows.map((row) => str(row.providerSubject)).filter(Boolean),
    );
    if (subjects.size !== 1) {
      throw portalError(
        'FAILED_PRECONDITION',
        'IDENTITY_BINDING_AMBIGUOUS',
        'Multiple Casdoor identity bindings conflict for this user.',
      );
    }
    const providerSubject = [...subjects][0];
    const casdoorUserId = await this.toEnforceSubject(providerSubject);
    return {
      providerIssuer: issuer,
      providerSubject,
      casdoorUserId,
      localUserId,
    };
  }

  private async toEnforceSubject(providerSubject: string): Promise<string> {
    if (isOwnerName(providerSubject)) return providerSubject;
    const client = this.client();
    if (!client) {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'Casdoor management API is required to resolve the Enforce subject.',
      );
    }
    const user = await client.findUserByIdOrName(providerSubject);
    if (!user) {
      throw portalError(
        'PERMISSION_DENIED',
        'IDENTITY_BINDING_REQUIRED',
        'The bound Casdoor subject cannot be resolved to an Enforce id.',
      );
    }
    if (isOwnerName(user.id)) return user.id;
    return `${user.owner}/${user.name}`;
  }
}

function isOwnerName(value: string): boolean {
  const slash = value.indexOf('/');
  return (
    slash > 0 && slash === value.lastIndexOf('/') && slash < value.length - 1
  );
}
