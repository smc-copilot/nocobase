import { MeetingGatewayError } from './errors.js';

export interface GatewayPage<T> {
  readonly meetingId: string;
  readonly pos: number;
  readonly size: number;
  readonly hasRemaining: boolean;
  readonly nextPos: number | null;
  readonly items: readonly T[];
}

/**
 * Walks the published record-files page shape from
 * loudon84/anything-llm@codex/meeting-intelligence
 * `server/modules/meetings/gatewayImporter.js` (`allRecordFiles`).
 * HTTP query methods are still unconfirmed in `client.js`; this helper is used
 * by the isolation test adapter and will apply to HTTP once that contract lands.
 */
export async function collectGatewayPages<T>(options: {
  meetingId: string;
  pageSize: number;
  itemId: (item: T) => string | undefined;
  fetchPage: (pos: number, size: number) => Promise<GatewayPage<T>>;
}): Promise<T[]> {
  const result: T[] = [];
  const seenIds = new Set<string>();
  const cursors = new Set<number>();
  let pos = 0;
  for (;;) {
    if (cursors.has(pos)) {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'The gateway repeated a pagination cursor.',
        'UNAVAILABLE',
      );
    }
    cursors.add(pos);
    const page = await options.fetchPage(pos, options.pageSize);
    if (
      !page ||
      page.meetingId !== options.meetingId ||
      page.pos !== pos ||
      page.size !== options.pageSize ||
      typeof page.hasRemaining !== 'boolean' ||
      !Array.isArray(page.items) ||
      (page.hasRemaining &&
        (!Number.isSafeInteger(page.nextPos) || (page.nextPos ?? 0) <= pos)) ||
      (!page.hasRemaining && page.nextPos !== null)
    ) {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'A gateway page did not match the published pagination contract.',
        'UNAVAILABLE',
      );
    }
    const items: readonly T[] = page.items;
    for (const item of items) {
      const id = options.itemId(item);
      if (typeof id !== 'string' || !id.trim()) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'A gateway page item was missing its id.',
          'UNAVAILABLE',
        );
      }
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      result.push(item);
    }
    if (!page.hasRemaining) break;
    if (typeof page.nextPos !== 'number') {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'A gateway page did not match the published pagination contract.',
        'UNAVAILABLE',
      );
    }
    pos = page.nextPos;
  }
  return result;
}

export async function withReadonlyRetry<T>(
  operation: () => Promise<T>,
  options: {
    sleep?: (ms: number) => Promise<void>;
    delaysMs?: readonly number[];
  } = {},
): Promise<T> {
  const delays = options.delaysMs ?? [1_000, 3_000];
  const sleep =
    options.sleep ??
    (async (ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof MeetingGatewayError &&
        error.retryable &&
        attempt < delays.length;
      if (!retryable) throw error;
      await sleep(delays[attempt] ?? 0);
    }
  }
  throw lastError;
}
