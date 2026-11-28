import { isUniqueConstraintViolation } from '@nocobase/db';

import type { AdmissionPolicy } from '../admission.js';
import { hubError } from '../errors.js';
import type { ActorContext, Page, PageQuery, ProviderType } from '../model.js';
import { isProviderType, pageWindow } from '../model.js';
import {
  blankToNull,
  iso,
  isoOrNull,
  readJson,
  str,
  strOrNull,
  toBool,
  toDate,
  toDateOrNull,
  writeJson,
} from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { IdentityAuditLog } from './audit.js';

export interface ProviderInput {
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly displayName: string;
  readonly enabled?: boolean;
  readonly capabilities?: Record<string, unknown> | null;
  readonly issuer?: string | null;
  readonly discoveryUrl?: string | null;
  readonly endpoints?: Record<string, unknown> | null;
  readonly secretRef?: string | null;
  readonly claimMapping?: Record<string, unknown> | null;
  readonly admissionPolicy?: AdmissionPolicy | null;
  readonly syncPolicy?: Record<string, unknown> | null;
  readonly attributeAuthority?: Record<string, unknown> | null;
}

export interface ProviderPatch {
  readonly providerType?: ProviderType;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly capabilities?: Record<string, unknown> | null;
  readonly issuer?: string | null;
  readonly discoveryUrl?: string | null;
  readonly endpoints?: Record<string, unknown> | null;
  readonly secretRef?: string | null;
  readonly claimMapping?: Record<string, unknown> | null;
  readonly admissionPolicy?: AdmissionPolicy | null;
  readonly syncPolicy?: Record<string, unknown> | null;
  readonly attributeAuthority?: Record<string, unknown> | null;
}

export interface ProviderView {
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly capabilities: Record<string, unknown> | null;
  readonly issuer: string | null;
  readonly discoveryUrl: string | null;
  readonly endpoints: Record<string, unknown> | null;
  readonly secretConfigured: boolean;
  readonly claimMapping: Record<string, unknown> | null;
  readonly admissionPolicy: AdmissionPolicy | null;
  readonly syncPolicy: Record<string, unknown> | null;
  readonly attributeAuthority: Record<string, unknown> | null;
  readonly lastHealthCheckAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class ProviderRegistry {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
  ) {}

  public async create(
    input: ProviderInput,
    actor?: ActorContext,
  ): Promise<ProviderView> {
    this.assertType(input.providerType);
    const providerId = input.providerId.trim();
    if (!providerId) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_PROVIDER_ID_REQUIRED',
        'A provider needs an id.',
      );
    }
    try {
      return await this.runtime.transaction(async (connection) => {
        const now = this.runtime.now();
        await connection.query
          .insertInto(tables.providers)
          .values({
            providerId,
            providerType: input.providerType,
            displayName: input.displayName.trim(),
            enabled: input.enabled ?? true,
            capabilities: writeJson(input.capabilities ?? null),
            issuer: blankToNull(input.issuer),
            discoveryUrl: blankToNull(input.discoveryUrl),
            endpoints: writeJson(input.endpoints ?? null),
            secretRef: blankToNull(input.secretRef),
            claimMapping: writeJson(input.claimMapping ?? null),
            admissionPolicy: writeJson(input.admissionPolicy ?? null),
            syncPolicy: writeJson(input.syncPolicy ?? null),
            attributeAuthority: writeJson(input.attributeAuthority ?? null),
            lastHealthCheckAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await this.audit.append(
          {
            action: 'provider.created',
            actorId: actor?.actorId,
            providerId,
            requestId: actor?.requestId,
            entityType: 'provider',
            entityId: providerId,
            details: {
              providerType: input.providerType,
              secretRef: input.secretRef ?? null,
            },
          },
          connection,
        );
        return this.require(providerId, connection);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw hubError(
          'ALREADY_EXISTS',
          'IDENTITY_HUB_PROVIDER_EXISTS',
          'A provider with this id already exists.',
        );
      }
      throw error;
    }
  }

  public async update(
    providerId: string,
    input: ProviderPatch,
    actor?: ActorContext,
  ): Promise<ProviderView> {
    const current = await this.require(providerId);
    if (input.providerType) this.assertType(input.providerType);
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.providers)
        .set({
          providerType: input.providerType ?? current.providerType,
          displayName: input.displayName?.trim() || current.displayName,
          enabled: input.enabled ?? current.enabled,
          capabilities:
            input.capabilities === undefined
              ? writeJson(current.capabilities)
              : writeJson(input.capabilities),
          issuer:
            input.issuer === undefined
              ? current.issuer
              : blankToNull(input.issuer),
          discoveryUrl:
            input.discoveryUrl === undefined
              ? current.discoveryUrl
              : blankToNull(input.discoveryUrl),
          endpoints:
            input.endpoints === undefined
              ? writeJson(current.endpoints)
              : writeJson(input.endpoints),
          secretRef:
            input.secretRef === undefined
              ? await this.storedSecretRef(providerId, connection)
              : blankToNull(input.secretRef),
          claimMapping:
            input.claimMapping === undefined
              ? writeJson(current.claimMapping)
              : writeJson(input.claimMapping),
          admissionPolicy:
            input.admissionPolicy === undefined
              ? writeJson(current.admissionPolicy)
              : writeJson(input.admissionPolicy),
          syncPolicy:
            input.syncPolicy === undefined
              ? writeJson(current.syncPolicy)
              : writeJson(input.syncPolicy),
          attributeAuthority:
            input.attributeAuthority === undefined
              ? writeJson(current.attributeAuthority)
              : writeJson(input.attributeAuthority),
          updatedAt: now,
        })
        .where('providerId', '=', providerId)
        .execute();
      await this.audit.append(
        {
          action: 'provider.updated',
          actorId: actor?.actorId,
          providerId,
          requestId: actor?.requestId,
          entityType: 'provider',
          entityId: providerId,
          details: { secretRef: input.secretRef ?? null },
        },
        connection,
      );
      return this.require(providerId, connection);
    });
  }

  public async list(query: PageQuery = {}): Promise<Page<ProviderView>> {
    const window = pageWindow(query);
    const connection = this.runtime.database.connection();
    const [rows, countRow] = await Promise.all([
      connection.query
        .selectFrom(tables.providers)
        .selectAll()
        .orderBy('providerId', 'asc')
        .limit(window.pageSize)
        .offset(window.offset)
        .execute(),
      connection.query
        .selectFrom(tables.providers)
        .select(({ fn }) => [fn.countAll().as('total')])
        .executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toProvider(row as Record<string, unknown>)),
      total: Number((countRow as { total?: unknown } | undefined)?.total ?? 0),
      page: window.page,
      pageSize: window.pageSize,
    };
  }

  public get(providerId: string): Promise<ProviderView> {
    return this.require(providerId);
  }

  private assertType(value: string): void {
    if (!isProviderType(value)) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_PROVIDER_TYPE_INVALID',
        'Provider type must be manual, ldap, oidc, oauth2, casdoor, or oa-ltpa.',
      );
    }
  }

  private async storedSecretRef(
    providerId: string,
    connection: ReturnType<HubRuntime['database']['connection']>,
  ): Promise<string | null> {
    const row = await connection.query
      .selectFrom(tables.providers)
      .select('secretRef')
      .where('providerId', '=', providerId)
      .executeTakeFirst();
    return strOrNull((row as { secretRef?: unknown } | undefined)?.secretRef);
  }

  private async require(
    providerId: string,
    connection = this.runtime.database.connection(),
  ): Promise<ProviderView> {
    const row = await connection.query
      .selectFrom(tables.providers)
      .selectAll()
      .where('providerId', '=', providerId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_PROVIDER_NOT_FOUND',
        'The identity provider was not found.',
      );
    }
    return toProvider(row);
  }
}

function toProvider(row: Record<string, unknown>): ProviderView {
  const providerType = str(row.providerType);
  const secretRef = strOrNull(row.secretRef);
  return {
    providerId: str(row.providerId),
    providerType: isProviderType(providerType) ? providerType : 'manual',
    displayName: str(row.displayName),
    enabled: toBool(row.enabled),
    capabilities: readJson<Record<string, unknown> | null>(
      row.capabilities,
      null,
    ),
    issuer: strOrNull(row.issuer),
    discoveryUrl: strOrNull(row.discoveryUrl),
    endpoints: readJson<Record<string, unknown> | null>(row.endpoints, null),
    secretConfigured: secretRef != null && secretRef !== '',
    claimMapping: readJson<Record<string, unknown> | null>(
      row.claimMapping,
      null,
    ),
    admissionPolicy: readJson<AdmissionPolicy | null>(
      row.admissionPolicy,
      null,
    ),
    syncPolicy: readJson<Record<string, unknown> | null>(row.syncPolicy, null),
    attributeAuthority: readJson<Record<string, unknown> | null>(
      row.attributeAuthority,
      null,
    ),
    lastHealthCheckAt: isoOrNull(toDateOrNull(row.lastHealthCheckAt)),
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}
