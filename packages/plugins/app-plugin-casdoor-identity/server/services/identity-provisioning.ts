import { createHash, randomUUID } from 'node:crypto';

import { evaluateAdmission } from '../identity/admission.js';
import { extractIdentity } from '../identity/claims.js';
import {
  nowOf,
  type ExternalIdentityClaims,
  type IdentityProviderRecord,
  type IdentityRuntime,
} from '../identity/model.js';
import {
  identityError,
  isUniqueViolation,
  KeyedMutex,
  str,
  toDateOrNull,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';
import type { IdentityProviderService } from './identity-providers.js';
import type { PermissionMappingService } from './permission-mapping.js';

/** The verified claims of an access token, before any provider-specific claim mapping. */
export interface VerifiedToken {
  readonly issuer: string;
  readonly subject: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface LoginBinding {
  readonly bindingId: string;
  readonly localUserId: string;
  /** True only for the call that created the local user and the binding. */
  readonly created: boolean;
}

/** An address no mailbox can receive, for a directory user that carries no e-mail claim. */
function placeholderEmail(issuer: string, subject: string): string {
  const digest = createHash('sha256')
    .update(`${issuer}\n${subject}`)
    .digest('hex');
  return `${digest.slice(0, 32)}@external.invalid`;
}

/**
 * First-login initialization and repeat-login reuse.
 *
 * The stable key is `(issuer, subject)`. A changed name or e-mail never creates another account,
 * and an e-mail that already belongs to a local user is never an automatic merge: a different
 * subject with the same address is refused rather than bound to the existing user.
 */
export class IdentityProvisioningService {
  private readonly locks = new KeyedMutex();

  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly providers: IdentityProviderService,
    private readonly mapping: PermissionMappingService,
    private readonly audit: IdentityAuditLog,
  ) {}

  private async findBinding(
    issuer: string,
    subject: string,
  ): Promise<{ id: string; localUserId: string } | undefined> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('externalIdentities')
      .select(['id', 'localUserId'])
      .where('providerIssuer', '=', issuer)
      .where('providerSubject', '=', subject)
      .executeTakeFirst();
    return row
      ? { id: str(row.id), localUserId: str(row.localUserId) }
      : undefined;
  }

  /**
   * Resolves the binding for a verified identity, provisioning it on the first login when the
   * provider's admission policy admits the identity. Never invents a binding for an identity the
   * policy does not admit, and a provider without an admission policy admits nobody.
   */
  public onLogin(token: VerifiedToken): Promise<LoginBinding> {
    return this.locks.run(`${token.issuer}\n${token.subject}`, () =>
      this.onLoginLocked(token),
    );
  }

  private async onLoginLocked(token: VerifiedToken): Promise<LoginBinding> {
    const provider = await this.providers.findEnabledByIssuer(token.issuer);
    const identity = extractIdentity(
      token.issuer,
      token.subject,
      token.attributes,
      provider?.claimMapping,
    );
    const existing = await this.findBinding(identity.issuer, identity.subject);
    if (existing) {
      if (provider) this.assertAdmitted(provider, identity);
      await this.reuse(existing, identity, provider);
      return {
        bindingId: existing.id,
        localUserId: existing.localUserId,
        created: false,
      };
    }
    if (!provider) {
      throw identityError(
        'PERMISSION_DENIED',
        'SUBJECT_BINDING_REQUIRED',
        'No local user is bound to this external subject.',
      );
    }
    this.assertAdmitted(provider, identity);
    return this.provision(identity, provider);
  }

  private assertAdmitted(
    provider: IdentityProviderRecord,
    identity: ExternalIdentityClaims,
  ): void {
    const decision = evaluateAdmission(provider.admissionPolicy, identity);
    if (!decision.allowed) {
      throw identityError(
        'PERMISSION_DENIED',
        'ADMISSION_DENIED',
        'The identity provider admission policy does not admit this user.',
        { cause: decision.reason },
      );
    }
  }

  /** Repeat login: touch the binding, follow a name change, and re-run the permission mapping. */
  private async reuse(
    binding: { id: string; localUserId: string },
    identity: ExternalIdentityClaims,
    provider: IdentityProviderRecord | undefined,
  ): Promise<void> {
    const connection = this.runtime.database().connection();
    const now = nowOf(this.runtime);
    await connection.query
      .updateTable('externalIdentities')
      .set({ lastSyncedAt: now, updatedAt: now })
      .where('id', '=', binding.id)
      .execute();
    const user = await connection.query
      .selectFrom('user')
      .select(['name', 'disabledAt'])
      .where('id', '=', binding.localUserId)
      .executeTakeFirst();
    // A disabled or missing user is rejected by the resolver; granting it anything would be wrong.
    if (!user || toDateOrNull(user.disabledAt) != null) return;
    if (identity.name && identity.name !== user.name) {
      const context = await this.runtime.auth().administrationContext();
      await context.internalAdapter.updateUser(binding.localUserId, {
        name: identity.name,
      });
    }
    if (provider) {
      await this.mapping.reconcileIdentity(
        binding.localUserId,
        provider.providerId,
        identity,
      );
    }
  }

  private async provision(
    identity: ExternalIdentityClaims,
    provider: IdentityProviderRecord,
  ): Promise<LoginBinding> {
    const database = this.runtime.database();
    const now = nowOf(this.runtime);
    const email =
      identity.email ?? placeholderEmail(identity.issuer, identity.subject);

    // Different subject, same address: never merge into the existing account.
    const owner = await database
      .connection()
      .query.selectFrom('user')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    if (owner) throw this.emailConflict();

    const bindingId = randomUUID();
    let localUserId: string | undefined;
    try {
      // The user and its binding commit together: the loser of a race rolls back its user too.
      await database.transaction(async (connection) => {
        const context = await this.runtime
          .auth()
          .forConnection(connection)
          .administrationContext();
        const user = await context.internalAdapter.createUser(
          {
            name: identity.name ?? identity.email ?? identity.subject,
            email,
            emailVerified: identity.emailVerified,
            disabledAt: null,
          },
          { method: 'admin' },
        );
        localUserId = user.id;
        await connection.query
          .insertInto('externalIdentities')
          .values({
            id: bindingId,
            providerIssuer: identity.issuer,
            providerSubject: identity.subject,
            localUserId: user.id,
            lastSyncedAt: now,
            lastSeenEnabled: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another process bound this subject first, or the address was taken in the meantime.
      const winner = await this.findBinding(identity.issuer, identity.subject);
      if (winner) {
        return {
          bindingId: winner.id,
          localUserId: winner.localUserId,
          created: false,
        };
      }
      throw this.emailConflict();
    }

    await this.audit.record({
      action: 'identity.provision',
      actorId: null,
      targetType: 'externalIdentity',
      targetId: bindingId,
      details: {
        providerId: provider.providerId,
        issuer: identity.issuer,
        subject: identity.subject,
        localUserId,
      },
    });
    await this.mapping.reconcileIdentity(
      localUserId!,
      provider.providerId,
      identity,
    );
    return { bindingId, localUserId: localUserId!, created: true };
  }

  private emailConflict(): Error {
    return identityError(
      'ALREADY_EXISTS',
      'IDENTITY_EMAIL_CONFLICT',
      'A local user with this e-mail address exists; external identities are never merged automatically.',
    );
  }
}
