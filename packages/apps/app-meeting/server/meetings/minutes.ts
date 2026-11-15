export const MINUTES_PRIORITY = [
  'local',
  'ai_ds_minutes',
  'ai_minutes',
  'ai_topic_minutes',
  'ai_speaker_minutes',
] as const;

export type MinutesSource = (typeof MINUTES_PRIORITY)[number] | 'none';

export interface MeetingContentMinutesInput {
  localMinutes?: string | null;
  localMinutesEdited?: boolean;
  minutesAiDs?: string | null;
  minutesAi?: string | null;
  minutesTopic?: string | null;
  minutesSpeaker?: string | null;
}

export function resolveMinutes(content: MeetingContentMinutesInput): {
  text: string;
  source: MinutesSource;
} {
  if (content.localMinutesEdited && String(content.localMinutes ?? '').trim()) {
    return { text: String(content.localMinutes), source: 'local' };
  }
  const groups: ReadonlyArray<
    readonly [MinutesSource, string | null | undefined]
  > = [
    ['ai_ds_minutes', content.minutesAiDs],
    ['ai_minutes', content.minutesAi],
    ['ai_topic_minutes', content.minutesTopic],
    ['ai_speaker_minutes', content.minutesSpeaker],
  ];
  for (const [source, value] of groups) {
    if (String(value ?? '').trim()) {
      return { text: String(value), source };
    }
  }
  if (String(content.localMinutes ?? '').trim()) {
    return { text: String(content.localMinutes), source: 'local' };
  }
  return { text: '', source: 'none' };
}

const WHITELIST = new Set([
  '待办事项',
  '行动项',
  'actionitems',
  'actionitem',
  'todo',
  'to-do',
]);

export interface SourceTodo {
  readonly title: string;
  readonly description: string;
}

export function extractSourceTodos(text: string): readonly SourceTodo[] {
  const lines = String(text ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n');
  const items: SourceTodo[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim().replace(/:$/, '');
    const heading = trimmed.replace(/^#{1,6}\s+/, '');
    const normalized = heading.replaceAll(/\s+/g, '').toLowerCase();
    if (WHITELIST.has(normalized) || WHITELIST.has(heading)) {
      inSection = true;
      continue;
    }
    if (inSection && /^(#{1,6})\s+/.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const list = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (list?.[1]?.trim()) {
      items.push({ title: list[1].trim(), description: '' });
    }
  }
  return items.slice(0, 50);
}

export function parseJsonField<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
