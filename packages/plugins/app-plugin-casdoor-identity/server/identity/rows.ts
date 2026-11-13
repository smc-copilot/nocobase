import { ApiError } from '@nocobase/app-server/router';

import { ERROR_DOMAIN } from '../config.js';

/** JSON columns come back parsed on some dialects and as text on others. */
export function readJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    return new Date(/^-?\d+(?:\.\d+)?$/u.test(value) ? Number(value) : value);
  }
  return new Date(Number.NaN);
}

export function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : toDate(value);
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Database scalars (strings, numbers, bigints) as text; anything else is not a valid column value. */
export function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

export function strOrNull(value: unknown): string | null {
  return value == null ? null : str(value);
}

/**
 * Whether `error`, or an error it wraps, is a unique-constraint violation from any supported
 * dialect (the database package keeps its own detection private).
 */
export function isUniqueViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      record.errCode === -6602 ||
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    )
      return true;
    current = record.cause ?? record.originalError;
  }
  return false;
}

export function identityError(
  status: ConstructorParameters<typeof ApiError>[0]['status'],
  reason: string,
  message: string,
  metadata?: Record<string, unknown>,
): ApiError {
  return new ApiError({
    status,
    reason,
    domain: ERROR_DOMAIN,
    message,
    ...(metadata ? { metadata } : {}),
  });
}

/** Serializes async work per key inside this process; the unique indexes cover other processes. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  public async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.then(work, work);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
