import { randomUUID } from 'node:crypto';

import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

import type { OutboxPublisher } from './outbox.js';

export class HubRuntime {
  public constructor(
    public readonly database: DatabaseManager,
    public readonly outbox: OutboxPublisher,
    private readonly clock: () => Date = () => new Date(),
    private readonly ids: () => string = randomUUID,
  ) {}

  public now(): Date {
    return this.clock();
  }

  public id(): string {
    return this.ids();
  }

  public transaction<T>(
    work: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(work);
  }
}
