const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const WALL = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function utcFromBeijingParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - BEIJING_OFFSET_MS,
  );
}

function beijingParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function isoToBeijingDateTime(iso: string): string {
  const parts = beijingParts(new Date(iso));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function isoToBeijingInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 16).replace(' ', 'T');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return isoToBeijingDateTime(trimmed).slice(0, 16).replace(' ', 'T');
}

export function beijingWallToIso(value: string): string | null {
  const match = WALL.exec(value.trim());
  if (!match) return null;
  const date = utcFromBeijingParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? '0'),
    Number(match[5] ?? '0'),
    Number(match[6] ?? '0'),
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function dateInputToDue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return beijingWallToIso(trimmed);
}

export function parseWallDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseWallTime(value: string): string {
  const match = /[T ](\d{2}:\d{2})/.exec(value.trim());
  return match?.[1] ?? '';
}

export function formatWallDate(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatWallDateTime(
  date: Date | undefined,
  time: string,
): string {
  const day = formatWallDate(date);
  if (!day) return '';
  const clock = /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  return `${day}T${clock}`;
}
