import {
  isUniqueConstraintViolation,
  type DatabaseConnection,
} from '@nocobase/db';

import { hubError } from '../errors.js';
import type { ActorContext, IdentityStatus } from '../model.js';
import { buildIdentityKey } from '../model.js';
import {
  blankToNull,
  iso,
  isoOrNull,
  str,
  strOrNull,
  toDate,
  toDateOrNull,
} from '../rows.js';
import type { HubRuntime } from '../runtime.js';
import { tables } from '../tables.js';
import type { IdentityAuditLog } from './audit.js';
import type { PersonService } from './persons.js';

export interface LinkPreviewInput {
  readonly providerId: string;
  readonly subject: string;
  readonly issuer?: string | null;
  readonly externalId?: string | null;
  /** Accepted and ignored for matching. Email never selects a person. */
  readonly email?: string | null;
}

export interface LinkInput extends LinkPreviewInput {
  readonly personId: string;
  readonly externalUsername?: string | null;
}

export interface IdentityView {
  readonly identityId: string;
  readonly personId: string;
  readonly providerId: string;
  readonly providerType: string;
  readonly issuer: string | null;
  readonly subject: string;
  readonly externalId: string | null;
  readonly externalUsername: string | null;
  readonly identityKey: string;
  readonly status: IdentityStatus;
  readonly verifiedAt: string | null;
  readonly lastAuthenticatedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LinkPreview {
  readonly identityKey: string;
  readonly existingIdentity: IdentityView | null;
  readonly suggestedPersonId: string | null;
  readonly emailMatchIgnored: boolean;
}

const identityStatuses = new Set<IdentityStatus>([
  'active',
  'disabled',
  'pending',
  'unlinked',
]);

export class IdentityLinkService {
  public constructor(
    private readonly runtime: HubRuntime,
    private readonly audit: IdentityAuditLog,
    private readonly persons: PersonService,
  ) {}

  public async linkPreview(input: LinkPreviewInput): Promise<LinkPreview> {
    const identityKey = buildIdentityKey(input);
    const existing = await this.findByKey(input.providerId, identityKey);
    const email = blankToNull(input.email);
    const emailOwner = email
      ? await this.persons.findByEmail(email)
      : undefined;
    const emailMatchIgnored = Boolean(
      emailOwner && emailOwner.personId !== existing?.personId,
    );
    return {
      identityKey,
      existingIdentity: existing ?? null,
      suggestedPersonId: existing?.personId ?? null,
      emailMatchIgnored,
    };
  }

  public async link(
    input: LinkInput,
    actor?: ActorContext,
  ): Promise<IdentityView> {
    const person = await this.persons.get(input.personId);
    const provider = await this.requireProvider(input.providerId);
    const identityKey = buildIdentityKey(input);
    const subject = input.subject.trim();
    if (!subject) {
      throw hubError(
        'INVALID_ARGUMENT',
        'IDENTITY_HUB_SUBJECT_REQUIRED',
        'An identity needs a subject.',
      );
    }
    try {
      return await this.runtime.transaction(async (connection) => {
        const now = this.runtime.now();
        const existing = await this.findByKey(
          input.providerId,
          identityKey,
          connection,
        );
        if (existing && existing.status !== 'unlinked') {
          throw hubError(
            'ALREADY_EXISTS',
            'IDENTITY_HUB_IDENTITY_ALREADY_LINKED',
            'This provider identity is already linked.',
            { identityId: existing.identityId, personId: existing.personId },
          );
        }
        const identityId = existing?.identityId ?? this.runtime.id();
        if (existing) {
          await connection.query
            .updateTable(tables.identities)
            .set({
              personId: person.personId,
              providerType: provider.providerType,
              issuer: blankToNull(input.issuer),
              subject,
              externalId: blankToNull(input.externalId),
              externalUsername: blankToNull(input.externalUsername),
              status: 'active',
              updatedAt: now,
            })
            .where('identityId', '=', identityId)
            .execute();
        } else {
          await connection.query
            .insertInto(tables.identities)
            .values({
              identityId,
              personId: person.personId,
              providerId: provider.providerId,
              providerType: provider.providerType,
              issuer: blankToNull(input.issuer),
              subject,
              externalId: blankToNull(input.externalId),
              externalUsername: blankToNull(input.externalUsername),
              identityKey,
              status: 'active',
              verifiedAt: null,
              lastAuthenticatedAt: null,
              lastSyncedAt: null,
              createdAt: now,
              updatedAt: now,
            })
            .execute();
        }
        const stored = await this.require(identityId, connection);
        await this.audit.append(
          {
            action: 'identity.linked',
            actorId: actor?.actorId,
            personId: person.personId,
            providerId: provider.providerId,
            requestId: actor?.requestId,
            entityType: 'identity',
            entityId: identityId,
            details: { identityKey, subject },
          },
          connection,
        );
        return stored;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw hubError(
          'ALREADY_EXISTS',
          'IDENTITY_HUB_IDENTITY_ALREADY_LINKED',
          'This provider identity is already linked.',
        );
      }
      throw error;
    }
  }

  public async unlink(
    input: { readonly providerId: string; readonly identityId: string },
    actor?: ActorContext,
  ): Promise<IdentityView> {
    const current = await this.require(input.identityId);
    if (current.providerId !== input.providerId) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_IDENTITY_NOT_FOUND',
        'The identity was not found on this provider.',
      );
    }
    if (current.status === 'unlinked') return current;
    return this.runtime.transaction(async (connection) => {
      const now = this.runtime.now();
      await connection.query
        .updateTable(tables.identities)
        .set({ status: 'unlinked', updatedAt: now })
        .where('identityId', '=', current.identityId)
        .execute();
      await this.audit.append(
        {
          action: 'identity.unlinked',
          actorId: actor?.actorId,
          personId: current.personId,
          providerId: current.providerId,
          requestId: actor?.requestId,
          entityType: 'identity',
          entityId: current.identityId,
          details: { identityKey: current.identityKey },
        },
        connection,
      );
      return this.require(current.identityId, connection);
    });
  }

  public async listForPerson(
    personId: string,
  ): Promise<readonly IdentityView[]> {
    const rows = await this.runtime.database
      .connection()
      .query.selectFrom(tables.identities)
      .selectAll()
      .where('personId', '=', personId)
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map((row) => toIdentity(row as Record<string, unknown>));
  }

  private async findByKey(
    providerId: string,
    identityKey: string,
    connection?: DatabaseConnection,
  ): Promise<IdentityView | undefined> {
    const row = await (connection ?? this.runtime.database.connection()).query
      .selectFrom(tables.identities)
      .selectAll()
      .where('providerId', '=', providerId)
      .where('identityKey', '=', identityKey)
      .executeTakeFirst();
    return row ? toIdentity(row) : undefined;
  }

  private async require(
    identityId: string,
    connection?: DatabaseConnection,
  ): Promise<IdentityView> {
    const row = await (connection ?? this.runtime.database.connection()).query
      .selectFrom(tables.identities)
      .selectAll()
      .where('identityId', '=', identityId)
      .executeTakeFirst();
    if (!row) {
      throw hubError(
        'NOT_FOUND',
        'IDENTITY_HUB_IDENTITY_NOT_FOUND',
        'The identity was not found.',
      );
    }
    return toIdentity(row);
  }

  private async requireProvider(providerId: string): Promise<{
    readonly providerId: string;
    readonly providerType: string;
    readonly enabled: boolean;
  }> {
    const row = await this.runtime.database
      .connection()
      .query.selectFrom(tables.providers)
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
    const record = row as Record<string, unknown>;
    const enabled =
      record.enabled === true ||
      record.enabled === 1 ||
      record.enabled === '1' ||
      record.enabled === 'true';
    if (!enabled) {
      throw hubError(
        'FAILED_PRECONDITION',
        'IDENTITY_HUB_PROVIDER_DISABLED',
        'A disabled provider cannot link identities.',
      );
    }
    return {
      providerId: str(record.providerId),
      providerType: str(record.providerType),
      enabled,
    };
  }
}

function toIdentity(row: Record<string, unknown>): IdentityView {
  const status = str(row.status);
  return {
    identityId: str(row.identityId),
    personId: str(row.personId),
    providerId: str(row.providerId),
    providerType: str(row.providerType),
    issuer: strOrNull(row.issuer),
    subject: str(row.subject),
    externalId: strOrNull(row.externalId),
    externalUsername: strOrNull(row.externalUsername),
    identityKey: str(row.identityKey),
    status: identityStatuses.has(status as IdentityStatus)
      ? (status as IdentityStatus)
      : 'pending',
    verifiedAt: isoOrNull(toDateOrNull(row.verifiedAt)),
    lastAuthenticatedAt: isoOrNull(toDateOrNull(row.lastAuthenticatedAt)),
    lastSyncedAt: isoOrNull(toDateOrNull(row.lastSyncedAt)),
    createdAt: iso(toDate(row.createdAt)),
    updatedAt: iso(toDate(row.updatedAt)),
  };
}
