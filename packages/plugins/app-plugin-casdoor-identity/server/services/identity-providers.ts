import { randomUUID } from 'node:crypto';

import {
  nowOf,
  type AdmissionPolicy,
  type ClaimMapping,
  type IdentityProviderRecord,
  type IdentityRuntime,
} from '../identity/model.js';
import {
  identityError,
  readJson,
  str,
  strOrNull,
  toBool,
  toDate,
} from '../identity/rows.js';
import type { IdentityAuditLog } from './audit.js';

export interface UpsertIdentityProviderInput {
  readonly providerId: string;
  readonly issuer: string;
  readonly clientId?: string | null;
  /** Write-only pointer to the secret; reads only report whether one is configured. */
  readonly secretRef?: string | null;
  readonly claimMapping?: ClaimMapping;
  readonly admissionPolicy?: AdmissionPolicy;
  readonly enabled?: boolean;
}

/** What the admin API returns: the secret reference is never echoed. */
export interface IdentityProviderView {
  readonly providerId: string;
  readonly issuer: string;
  readonly clientId: string | null;
  readonly secretConfigured: boolean;
  readonly claimMapping: ClaimMapping;
  readonly admissionPolicy: AdmissionPolicy;
  readonly admissionConfigured: boolean;
  readonly enabled: boolean;
  readonly updatedAt: Date;
}

export function toProviderView(
  record: IdentityProviderRecord,
  admissionConfigured: boolean,
): IdentityProviderView {
  return {
    providerId: record.providerId,
    issuer: record.issuer,
    clientId: record.clientId,
    secretConfigured: record.secretRef != null && record.secretRef !== '',
    claimMapping: record.claimMapping,
    admissionPolicy: record.admissionPolicy,
    admissionConfigured,
    enabled: record.enabled,
    updatedAt: record.updatedAt,
  };
}

function toRecord(row: Record<string, unknown>): IdentityProviderRecord {
  return {
    id: str(row.id),
    providerId: str(row.providerId),
    issuer: str(row.issuer),
    clientId: strOrNull(row.clientId),
    secretRef: strOrNull(row.secretRef),
    claimMapping: readJson<ClaimMapping>(row.claimMapping, {}),
    admissionPolicy: readJson<AdmissionPolicy>(row.admissionPolicy, {}),
    enabled: toBool(row.enabled),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

export class IdentityProviderService {
  constructor(
    private readonly runtime: IdentityRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async list(): Promise<readonly IdentityProviderRecord[]> {
    const rows = await this.runtime
      .database()
      .connection()
      .query.selectFrom('identityProviders')
      .selectAll()
      .orderBy('providerId', 'asc')
      .execute();
    return rows.map((row: Record<string, unknown>) => toRecord(row));
  }

  public async findByProviderId(
    providerId: string,
  ): Promise<IdentityProviderRecord | undefined> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('identityProviders')
      .selectAll()
      .where('providerId', '=', providerId)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  /** Only enabled providers participate in admission and sync. */
  public async findEnabledByIssuer(
    issuer: string,
  ): Promise<IdentityProviderRecord | undefined> {
    const row = await this.runtime
      .database()
      .connection()
      .query.selectFrom('identityProviders')
      .selectAll()
      .where('issuer', '=', issuer)
      .executeTakeFirst();
    const record = row ? toRecord(row) : undefined;
    return record?.enabled ? record : undefined;
  }

  public async upsert(
    input: UpsertIdentityProviderInput,
    actorId: string | null,
  ): Promise<IdentityProviderRecord> {
    const connection = this.runtime.database().connection();
    const existing = await this.findByProviderId(input.providerId);
    const now = nowOf(this.runtime);
    const issuerOwner = await connection.query
      .selectFrom('identityProviders')
      .select('providerId')
      .where('issuer', '=', input.issuer)
      .executeTakeFirst();
    if (issuerOwner && issuerOwner.providerId !== input.providerId) {
      throw identityError(
        'ALREADY_EXISTS',
        'IDENTITY_PROVIDER_ISSUER_CONFLICT',
        'Another identity provider already uses this issuer.',
      );
    }
    if (existing) {
      await connection.query
        .updateTable('identityProviders')
        .set({
          issuer: input.issuer,
          clientId:
            input.clientId === undefined ? existing.clientId : input.clientId,
          // Omitting secretRef keeps the stored one: the secret is write-only.
          secretRef:
            input.secretRef === undefined
              ? existing.secretRef
              : input.secretRef,
          claimMapping: JSON.stringify(
            input.claimMapping ?? existing.claimMapping,
          ),
          admissionPolicy: JSON.stringify(
            input.admissionPolicy ?? existing.admissionPolicy,
          ),
          enabled: input.enabled ?? existing.enabled,
          updatedAt: now,
        })
        .where('providerId', '=', input.providerId)
        .execute();
    } else {
      await connection.query
        .insertInto('identityProviders')
        .values({
          id: randomUUID(),
          providerId: input.providerId,
          issuer: input.issuer,
          clientId: input.clientId ?? null,
          secretRef: input.secretRef ?? null,
          claimMapping: JSON.stringify(input.claimMapping ?? {}),
          admissionPolicy: JSON.stringify(input.admissionPolicy ?? {}),
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    await this.audit.record({
      action: existing ? 'identityProvider.update' : 'identityProvider.create',
      actorId,
      targetType: 'identityProvider',
      targetId: input.providerId,
      // The secret reference is intentionally absent from the audit details.
      details: {
        issuer: input.issuer,
        secretChanged: input.secretRef !== undefined,
        admissionChanged: input.admissionPolicy !== undefined,
      },
    });
    return (await this.findByProviderId(input.providerId))!;
  }
}
