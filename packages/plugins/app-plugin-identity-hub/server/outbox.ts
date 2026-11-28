import type { DatabaseConnection } from '@nocobase/db';

/**
 * One identity-hub change published in the same transaction as the row and the audit event.
 *
 * Production should forward this to message-broker:
 * `messageBroker.publisher('identity-hub').publish(message, { transaction })`.
 * That binding is not wired in this cut. The hub does not create its own outbox table.
 * `NoopOutboxPublisher` is the process default. Tests use `InMemoryOutboxPublisher`.
 */
export interface IdentityHubOutboxMessage {
  readonly type: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface OutboxPublisher {
  publish(
    message: IdentityHubOutboxMessage,
    options: { readonly transaction: DatabaseConnection },
  ): Promise<void>;
}

export class NoopOutboxPublisher implements OutboxPublisher {
  public publish(
    _message: IdentityHubOutboxMessage,
    _options: { readonly transaction: DatabaseConnection },
  ): Promise<void> {
    return Promise.resolve();
  }
}

export class InMemoryOutboxPublisher implements OutboxPublisher {
  public readonly messages: IdentityHubOutboxMessage[] = [];

  public publish(
    message: IdentityHubOutboxMessage,
    _options: { readonly transaction: DatabaseConnection },
  ): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}
