import { createHash, randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import { portalError } from '../errors.js';
import { str, strOrNull, toDate } from './values.js';

export type RouteTicketRedeemResult =
  'consumed' | 'denied' | 'expired' | 'replayed';

export interface RouteTicketRow {
  readonly id: string;
  readonly jtiHash: string;
  readonly localUserId: string;
  readonly casdoorSubject: string;
  readonly appCode: string;
  readonly requestId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly redeemResult: RouteTicketRedeemResult | null;
  readonly createdAt: Date;
}

export function hashJti(jti: string): string {
  return createHash('sha256').update(jti, 'utf8').digest('hex');
}

export class RouteTicketStore {
  constructor(private readonly database: () => DatabaseManager) {}

  public async insert(input: {
    readonly jti: string;
    readonly localUserId: string;
    readonly casdoorSubject: string;
    readonly appCode: string;
    readonly requestId: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  }): Promise<RouteTicketRow> {
    const id = randomUUID();
    const jtiHash = hashJti(input.jti);
    const createdAt = input.issuedAt;
    await this.database()
      .connection()
      .query.insertInto('enterprisePortalRouteTickets')
      .values({
        id,
        jtiHash,
        localUserId: input.localUserId,
        casdoorSubject: input.casdoorSubject,
        appCode: input.appCode,
        requestId: input.requestId,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        consumedAt: null,
        redeemResult: null,
        createdAt,
      })
      .execute();
    return {
      id,
      jtiHash,
      localUserId: input.localUserId,
      casdoorSubject: input.casdoorSubject,
      appCode: input.appCode,
      requestId: input.requestId,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      consumedAt: null,
      redeemResult: null,
      createdAt,
    };
  }

  public async findByJti(jti: string): Promise<RouteTicketRow | undefined> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalRouteTickets')
      .selectAll()
      .where('jtiHash', '=', hashJti(jti))
      .executeTakeFirst();
    return row ? toRow(row) : undefined;
  }

  /**
   * Atomically marks a ticket consumed when still unused and unexpired.
   * Returns undefined when another worker won the race or the row is invalid.
   */
  public async tryConsume(input: {
    readonly jti: string;
    readonly now: Date;
  }): Promise<RouteTicketRow> {
    const jtiHash = hashJti(input.jti);
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalRouteTickets')
      .set({
        consumedAt: input.now,
        redeemResult: 'consumed',
      })
      .where('jtiHash', '=', jtiHash)
      .where('consumedAt', 'is', null)
      .where('expiresAt', '>', input.now)
      .execute();

    const existing = await this.findByJti(input.jti);
    if (!existing) {
      throw portalError(
        'NOT_FOUND',
        'TICKET_EXPIRED',
        'The route ticket is unknown or no longer valid.',
        undefined,
        410,
      );
    }
    if (
      existing.consumedAt &&
      existing.redeemResult === 'consumed' &&
      existing.consumedAt.getTime() === input.now.getTime()
    ) {
      return existing;
    }
    if (existing.consumedAt) {
      throw portalError(
        'FAILED_PRECONDITION',
        'TICKET_REPLAYED',
        'The route ticket was already redeemed.',
        undefined,
        409,
      );
    }
    if (existing.expiresAt.getTime() <= input.now.getTime()) {
      await this.markResult(existing.id, 'expired');
      throw portalError(
        'FAILED_PRECONDITION',
        'TICKET_EXPIRED',
        'The route ticket has expired.',
        undefined,
        410,
      );
    }
    throw portalError(
      'FAILED_PRECONDITION',
      'TICKET_REPLAYED',
      'The route ticket could not be redeemed.',
      undefined,
      409,
    );
  }

  public async markResult(
    id: string,
    redeemResult: RouteTicketRedeemResult,
  ): Promise<void> {
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalRouteTickets')
      .set({ redeemResult })
      .where('id', '=', id)
      .execute();
  }
}

function toRow(row: Record<string, unknown>): RouteTicketRow {
  return {
    id: str(row.id),
    jtiHash: str(row.jtiHash),
    localUserId: str(row.localUserId),
    casdoorSubject: str(row.casdoorSubject),
    appCode: str(row.appCode),
    requestId: str(row.requestId),
    issuedAt: toDate(row.issuedAt),
    expiresAt: toDate(row.expiresAt),
    consumedAt: row.consumedAt ? toDate(row.consumedAt) : null,
    redeemResult: strOrNull(row.redeemResult) as RouteTicketRedeemResult | null,
    createdAt: toDate(row.createdAt),
  };
}
