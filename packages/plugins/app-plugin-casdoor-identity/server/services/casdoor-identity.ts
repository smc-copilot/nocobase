import type { DatabaseConnection } from '@nocobase/db';

import type { CasdoorIdentityService } from '../tokens.js';

export interface ExternalIdentityRecord {
  readonly id: string;
  readonly providerIssuer: string;
  readonly providerSubject: string;
  readonly localUserId: string;
  readonly lastSyncedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BindExternalIdentityInput {
  readonly id: string;
  readonly providerIssuer: string;
  readonly providerSubject: string;
  readonly localUserId: string;
  readonly lastSyncedAt?: Date | null;
}

export class DefaultCasdoorIdentityService implements CasdoorIdentityService {
  constructor(private readonly connection: () => DatabaseConnection) {}

  public getMessage(): string {
    return 'Casdoor identity credential resolver';
  }

  public async findByIssuerSubject(
    providerIssuer: string,
    providerSubject: string,
  ): Promise<ExternalIdentityRecord | undefined> {
    const row = await this.connection()
      .query.selectFrom('externalIdentities')
      .selectAll()
      .where('providerIssuer', '=', providerIssuer)
      .where('providerSubject', '=', providerSubject)
      .executeTakeFirst();
    return row as ExternalIdentityRecord | undefined;
  }

  /** Test and admin helper: insert a binding row. Production sync lands in a later phase. */
  public async bind(
    input: BindExternalIdentityInput,
  ): Promise<ExternalIdentityRecord> {
    const now = new Date();
    await this.connection()
      .query.insertInto('externalIdentities')
      .values({
        id: input.id,
        providerIssuer: input.providerIssuer,
        providerSubject: input.providerSubject,
        localUserId: input.localUserId,
        lastSyncedAt: input.lastSyncedAt ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.findByIssuerSubject(
      input.providerIssuer,
      input.providerSubject,
    );
    if (!created) {
      throw new Error('Failed to read the external identity after insert.');
    }
    return created;
  }
}
