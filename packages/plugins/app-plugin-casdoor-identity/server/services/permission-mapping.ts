import { createHash, randomUUID } from 'node:crypto';

import { claimValues } from '../identity/claims.js';
import {
  nowOf,
  type ExternalIdentityClaims,
  type IdentityRuntime,
  type MappingRuleRecord,
} from '../identity/model.js';
import {
  identityError,
  isUniqueViolation,
  KeyedMutex,
  str,
  strOrNull,
  toBool,
  toDate,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';

export interface MappingRuleInput {
  readonly ruleId: string;
  readonly providerId: string;
  /** `organization`, `groups`, or a dotted attribute path such as `properties.department`. */
  readonly claim: string;
  readonly claimValue: string;
  readonly permissionSetKey: string;
  readonly enabled?: boolean;
}

export type MappingRulePatch = Partial<
  Pick<
    MappingRuleInput,
    'claim' | 'claimValue' | 'permissionSetKey' | 'enabled'
  >
>;

export interface MappingReconcileResult {
  readonly granted: readonly string[];
  readonly revoked: readonly string[];
  readonly kept: readonly string[];
  readonly skipped: readonly {
    readonly permissionSetKey: string;
    readonly reason: string;
  }[];
}

export const EMPTY_RECONCILE: MappingReconcileResult = {
  granted: [],
  revoked: [],
  kept: [],
  skipped: [],
};

interface ManagedRow {
  readonly id: string;
  readonly mappingRuleId: string;
  readonly permissionSetKey: string;
  readonly assignmentId: string;
  readonly sourceRevision: string;
}

function toRule(row: Record<string, unknown>): MappingRuleRecord {
  return {
    id: str(row.id),
    ruleId: str(row.ruleId),
    providerId: str(row.providerId),
    claim: str(row.claim),
    claimValue: str(row.claimValue),
    permissionSetKey: str(row.permissionSetKey),
    enabled: toBool(row.enabled),
    updatedBy: strOrNull(row.updatedBy),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

/** A stable digest of the enabled rules of a provider: the `sourceRevision` stamped on grants. */
export function rulesRevision(rules: readonly MappingRuleRecord[]): string {
  const lines = rules
    .filter((rule) => rule.enabled)
    .map(
      (rule) =>
        `${rule.ruleId}|${rule.claim}|${rule.claimValue}|${rule.permissionSetKey}`,
    )
    .sort();
  return createHash('sha256')
    .update(lines.join('\n'))
    .digest('hex')
    .slice(0, 32);
}

/** The enabled rules an identity matches. */
export function matchRules(
  identity: ExternalIdentityClaims,
  rules: readonly MappingRuleRecord[],
): MappingRuleRecord[] {
  return rules.filter(
    (rule) =>
      rule.enabled &&
      claimValues(identity, rule.claim).includes(rule.claimValue),
  );
}

/**
 * Maps trusted external attributes to an allowlisted set of Permission Sets.
 *
 * Ownership: every grant the adapter creates is recorded in `managedPermissionAssignments`, and
 * only those rows are ever revoked. A set a person assigned by hand is never taken over and
 * never removed, and a token string can never name a set directly: only configured, enabled
 * rules grant, and only sets in `mappablePermissionSets`.
 */
export class PermissionMappingService {
  private readonly locks = new KeyedMutex();

  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  // ----- Rules -----------------------------------------------------------------------------

  public async listRules(
    providerId?: string,
  ): Promise<readonly MappingRuleRecord[]> {
    let query = this.runtime
      .database()
      .connection()
      .query.selectFrom('identityMappingRules')
      .selectAll();
    if (providerId) query = query.where('providerId', '=', providerId);
    const rows = await query.orderBy('ruleId', 'asc').execute();
    return rows.map((row: Record<string, unknown>) => toRule(row));
  }

  public async getRule(ruleId: string): Promise<MappingRuleRecord | undefined> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('identityMappingRules')
      .selectAll()
      .where('ruleId', '=', ruleId)
      .executeTakeFirst();
    return row ? toRule(row) : undefined;
  }

  /**
   * Whether a Permission Set may be granted by mapping: it must be on the application's
   * allowlist, exist, and not confer unrestricted access (never `root`).
   */
  public async assertMappable(permissionSetKey: string): Promise<void> {
    const allowed = this.runtime.config().mappablePermissionSets ?? [];
    if (!allowed.includes(permissionSetKey)) {
      throw identityError(
        'FAILED_PRECONDITION',
        'PERMISSION_SET_NOT_MAPPABLE',
        `Permission Set ${permissionSetKey} is not on the mappable allowlist.`,
      );
    }
    const sets = this.runtime.permissionSets();
    if (!sets) {
      throw identityError(
        'FAILED_PRECONDITION',
        'AUTHORIZATION_UNAVAILABLE',
        'The authorization plugin is not registered, so Permission Sets cannot be mapped.',
      );
    }
    if (
      permissionSetKey === 'root' ||
      sets.protection(permissionSetKey)?.unrestricted
    ) {
      throw identityError(
        'FAILED_PRECONDITION',
        'PERMISSION_SET_NOT_MAPPABLE',
        'Mapping may never grant an unrestricted Permission Set.',
      );
    }
    if (!(await sets.get(permissionSetKey))) {
      throw identityError(
        'FAILED_PRECONDITION',
        'PERMISSION_SET_NOT_FOUND',
        `Permission Set ${permissionSetKey} does not exist.`,
      );
    }
  }

  /** Non-throwing form used when applying rules, which re-checks the allowlist every time. */
  private async isMappable(permissionSetKey: string): Promise<boolean> {
    try {
      await this.assertMappable(permissionSetKey);
      return true;
    } catch {
      return false;
    }
  }

  public async createRule(
    input: MappingRuleInput,
    actorId: string | null,
  ): Promise<MappingRuleRecord> {
    await this.assertMappable(input.permissionSetKey);
    const connection = this.runtime.database().connection();
    const provider = await connection.query
      .selectFrom('identityProviders')
      .select('providerId')
      .where('providerId', '=', input.providerId)
      .executeTakeFirst();
    if (!provider) {
      throw identityError(
        'FAILED_PRECONDITION',
        'IDENTITY_PROVIDER_NOT_FOUND',
        `Identity provider ${input.providerId} does not exist.`,
      );
    }
    const now = nowOf(this.runtime);
    try {
      await connection.query
        .insertInto('identityMappingRules')
        .values({
          id: randomUUID(),
          ruleId: input.ruleId,
          providerId: input.providerId,
          claim: input.claim,
          claimValue: input.claimValue,
          permissionSetKey: input.permissionSetKey,
          enabled: input.enabled ?? true,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw identityError(
          'ALREADY_EXISTS',
          'MAPPING_RULE_EXISTS',
          `Mapping rule ${input.ruleId} already exists.`,
        );
      }
      throw error;
    }
    await this.audit.record({
      action: 'mappingRule.create',
      actorId,
      targetType: 'mappingRule',
      targetId: input.ruleId,
      details: { ...input },
    });
    return (await this.getRule(input.ruleId))!;
  }

  public async updateRule(
    ruleId: string,
    patch: MappingRulePatch,
    actorId: string | null,
  ): Promise<MappingRuleRecord> {
    const existing = await this.getRule(ruleId);
    if (!existing) {
      throw identityError(
        'NOT_FOUND',
        'MAPPING_RULE_NOT_FOUND',
        `Mapping rule ${ruleId} was not found.`,
      );
    }
    if (patch.permissionSetKey !== undefined) {
      await this.assertMappable(patch.permissionSetKey);
    }
    await this.runtime
      .database()
      .connection()
      .query.updateTable('identityMappingRules')
      .set({
        claim: patch.claim ?? existing.claim,
        claimValue: patch.claimValue ?? existing.claimValue,
        permissionSetKey: patch.permissionSetKey ?? existing.permissionSetKey,
        enabled: patch.enabled ?? existing.enabled,
        updatedBy: actorId,
        updatedAt: nowOf(this.runtime),
      })
      .where('ruleId', '=', ruleId)
      .execute();
    await this.audit.record({
      action: 'mappingRule.update',
      actorId,
      targetType: 'mappingRule',
      targetId: ruleId,
      details: { ...patch },
    });
    return (await this.getRule(ruleId))!;
  }

  /** Deleting a rule also withdraws the grants it made (and only those). */
  public async deleteRule(
    ruleId: string,
    actorId: string | null,
  ): Promise<void> {
    const existing = await this.getRule(ruleId);
    if (!existing) {
      throw identityError(
        'NOT_FOUND',
        'MAPPING_RULE_NOT_FOUND',
        `Mapping rule ${ruleId} was not found.`,
      );
    }
    const connection = this.runtime.database().connection();
    const owners = await connection.query
      .selectFrom('managedPermissionAssignments')
      .select('localUserId')
      .where('mappingRuleId', '=', ruleId)
      .execute();
    await connection.query
      .deleteFrom('identityMappingRules')
      .where('ruleId', '=', ruleId)
      .execute();
    // With the rule gone nothing is desired from it, so each owner's reconcile withdraws its grants.
    for (const owner of new Set(
      owners.map((row: Record<string, unknown>) => str(row.localUserId)),
    )) {
      await this.reconcileUser(
        owner,
        await this.desiredFromStoredRules(owner),
        {
          revision: 'rule-deleted',
        },
      );
    }
    await this.audit.record({
      action: 'mappingRule.delete',
      actorId,
      targetType: 'mappingRule',
      targetId: ruleId,
      details: { permissionSetKey: existing.permissionSetKey },
    });
  }

  /** Rules a user keeps owning after a deletion: those their managed rows still name and that exist. */
  private async desiredFromStoredRules(
    userId: string,
  ): Promise<MappingRuleRecord[]> {
    const rows = await this.runtime
      .database()
      .connection()
      .query.selectFrom('managedPermissionAssignments')
      .select('mappingRuleId')
      .where('localUserId', '=', userId)
      .execute();
    const rules: MappingRuleRecord[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const rule = await this.getRule(str(row.mappingRuleId));
      if (rule?.enabled) rules.push(rule);
    }
    return rules;
  }

  // ----- Reconciliation --------------------------------------------------------------------

  public async managedRows(userId: string): Promise<readonly ManagedRow[]> {
    const rows = await this.runtime
      .database()
      .connection()
      .query.selectFrom('managedPermissionAssignments')
      .selectAll()
      .where('localUserId', '=', userId)
      .execute();
    return rows.map((row: Record<string, unknown>) => ({
      id: str(row.id),
      mappingRuleId: str(row.mappingRuleId),
      permissionSetKey: str(row.permissionSetKey),
      assignmentId: str(row.assignmentId),
      sourceRevision: str(row.sourceRevision),
    }));
  }

  /** Reconciles from an identity: matches the provider's enabled rules, then applies them. */
  public async reconcileIdentity(
    userId: string,
    providerId: string,
    identity: ExternalIdentityClaims | undefined,
    options: { readonly dryRun?: boolean } = {},
  ): Promise<MappingReconcileResult> {
    const rules = await this.listRules(providerId);
    const desired = identity ? matchRules(identity, rules) : [];
    return this.reconcileUser(userId, desired, {
      revision: rulesRevision(rules),
      ...(options.dryRun ? { dryRun: true } : {}),
    });
  }

  /**
   * Makes the user's adapter-managed grants equal `desired`. Grants the adapter did not create
   * are neither read as ours nor touched.
   */
  public reconcileUser(
    userId: string,
    desired: readonly MappingRuleRecord[],
    options: { readonly revision: string; readonly dryRun?: boolean },
  ): Promise<MappingReconcileResult> {
    return this.locks.run(userId, () =>
      this.reconcileLocked(userId, desired, options),
    );
  }

  private async reconcileLocked(
    userId: string,
    desired: readonly MappingRuleRecord[],
    options: { readonly revision: string; readonly dryRun?: boolean },
  ): Promise<MappingReconcileResult> {
    const sets = this.runtime.permissionSets();
    if (!sets) return EMPTY_RECONCILE;
    const dryRun = options.dryRun === true;
    const connection = this.runtime.database().connection();
    const now = nowOf(this.runtime);

    const managed = [...(await this.managedRows(userId))];
    const assignments = (await sets.listAssignments()).filter(
      (assignment) =>
        assignment.subject.type === 'user' && assignment.subject.id === userId,
    );

    const granted: string[] = [];
    const revoked: string[] = [];
    const kept: string[] = [];
    const skipped: { permissionSetKey: string; reason: string }[] = [];

    const desiredEntries: MappingRuleRecord[] = [];
    for (const rule of desired) {
      if (await this.isMappable(rule.permissionSetKey))
        desiredEntries.push(rule);
      else
        skipped.push({
          permissionSetKey: rule.permissionSetKey,
          reason: 'NOT_MAPPABLE',
        });
    }
    const desiredKeys = new Set(
      desiredEntries.map((rule) => `${rule.ruleId}|${rule.permissionSetKey}`),
    );

    // 1. Grants first, so a set two rules both want is created once and shared.
    for (const rule of desiredEntries) {
      const key = rule.permissionSetKey;
      const row = managed.find(
        (entry) =>
          entry.mappingRuleId === rule.ruleId && entry.permissionSetKey === key,
      );
      const existing = assignments.find(
        (assignment) => assignment.permissionSet === key,
      );
      const sharedOwner = managed.find(
        (entry) => entry.permissionSetKey === key,
      );

      if (row && existing && existing.id === row.assignmentId) {
        kept.push(key);
        if (row.sourceRevision !== options.revision && !dryRun) {
          await connection.query
            .updateTable('managedPermissionAssignments')
            .set({ sourceRevision: options.revision, updatedAt: now })
            .where('id', '=', row.id)
            .execute();
        }
        continue;
      }
      if (existing && !sharedOwner) {
        // A person assigned this set; the adapter never adopts it.
        skipped.push({
          permissionSetKey: key,
          reason: 'MANUAL_ASSIGNMENT_EXISTS',
        });
        continue;
      }
      if (dryRun) {
        granted.push(key);
        continue;
      }
      let assignmentId = existing?.id;
      if (!assignmentId) {
        try {
          const created = await sets.assign({
            subject: { type: 'user', id: userId },
            permissionSet: key,
          });
          assignmentId = created.id;
          assignments.push(created);
        } catch (error) {
          skipped.push({
            permissionSetKey: key,
            reason: error instanceof Error ? error.name : 'ASSIGN_REFUSED',
          });
          continue;
        }
      }
      if (row) {
        await connection.query
          .updateTable('managedPermissionAssignments')
          .set({
            assignmentId,
            sourceRevision: options.revision,
            updatedAt: now,
          })
          .where('id', '=', row.id)
          .execute();
      } else {
        try {
          await connection.query
            .insertInto('managedPermissionAssignments')
            .values({
              id: randomUUID(),
              localUserId: userId,
              mappingRuleId: rule.ruleId,
              permissionSetKey: key,
              assignmentId,
              sourceRevision: options.revision,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
          managed.push({
            id: '',
            mappingRuleId: rule.ruleId,
            permissionSetKey: key,
            assignmentId,
            sourceRevision: options.revision,
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      granted.push(key);
    }

    // 2. Revocations: only rows this adapter recorded and nothing desires any more.
    const stale = managed.filter(
      (entry) =>
        !desiredKeys.has(`${entry.mappingRuleId}|${entry.permissionSetKey}`),
    );
    for (const entry of stale) {
      const stillShared = managed.some(
        (other) =>
          other !== entry &&
          other.permissionSetKey === entry.permissionSetKey &&
          desiredKeys.has(`${other.mappingRuleId}|${other.permissionSetKey}`),
      );
      if (!dryRun) {
        if (entry.id) {
          await connection.query
            .deleteFrom('managedPermissionAssignments')
            .where('id', '=', entry.id)
            .execute();
        }
        if (!stillShared) {
          // Revoke through the recorded assignment id, and only if it is still that user's grant.
          const assignment = assignments.find(
            (candidate) => candidate.id === entry.assignmentId,
          );
          if (
            assignment &&
            assignment.permissionSet === entry.permissionSetKey
          ) {
            await sets.revoke(assignment.id);
          }
        }
      }
      if (!stillShared) revoked.push(entry.permissionSetKey);
    }

    if (!dryRun && (granted.length > 0 || revoked.length > 0)) {
      await this.audit.record({
        action: 'permissionMapping.reconcile',
        actorId: null,
        targetType: 'user',
        targetId: userId,
        details: { granted, revoked, revision: options.revision },
      });
    }
    return { granted, revoked, kept, skipped };
  }
}
