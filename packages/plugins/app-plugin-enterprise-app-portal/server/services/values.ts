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

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  return new Date(0);
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}
