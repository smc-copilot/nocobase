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

export function writeJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
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

export function iso(value: Date): string {
  return value.toISOString();
}

export function isoOrNull(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function toInt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return 0;
}

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

export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
