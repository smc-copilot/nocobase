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

const PLACEHOLDER =
  /^(?:暂无(?:会议)?(?:摘要|纪要|总结|内容|待办)?|无|无内容|none|n\/a|no\s+(?:summary|minutes|todos?)(?:\s+available)?)[。.!！]?$/i;
const AI_FOOTER =
  /^(?:[（(]注[：:]\s*文档部分内容可能由\s*AI\s*生成[）)]|内容由\s*AI\s*生成[，,]?\s*仅供参考)\s*$/i;
const SUMMARY_TITLE = /^(?:会议摘要|会议总结|摘要|summary)$/i;
const TODO_TITLE = /^(?:会议待办|待办事项|行动项|action\s*items?|to-?do)$/i;

function heading(line: string): { title: string; level: number | null } {
  const match = line.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/);
  const raw = match ? match[2] : line.trim();
  return {
    title: raw
      .replace(/^\*\*(.*?)\*\*$/, '$1')
      .replace(/[：:]$/, '')
      .trim(),
    level: match ? match[1].length : null,
  };
}

function substantive(lines: readonly string[]): boolean {
  return lines.some((line) => {
    const value = line.trim();
    return (
      value &&
      !/^#{1,6}\s/.test(value) &&
      !PLACEHOLDER.test(value) &&
      !AI_FOOTER.test(value)
    );
  });
}

export function isEffectiveMinutes(text: string | null | undefined): boolean {
  const lines = String(text ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n');
  return substantive(lines);
}

export function splitMinutes(text: string): { summary: string; todos: string } {
  const lines = String(text ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n');
  const summaryAt = lines.findIndex((line) =>
    SUMMARY_TITLE.test(heading(line).title),
  );
  const body = summaryAt >= 0 ? lines.slice(summaryAt + 1) : lines;
  const kept: string[] = [];
  const todoLines: string[] = [];
  let skippingTodo = false;
  let todoLevel: number | null = null;
  for (const line of body) {
    if (AI_FOOTER.test(line.trim())) continue;
    const current = heading(line);
    if (TODO_TITLE.test(current.title)) {
      skippingTodo = true;
      todoLevel = current.level;
      continue;
    }
    if (skippingTodo) {
      if (
        current.level != null &&
        (todoLevel == null || current.level <= todoLevel)
      ) {
        skippingTodo = false;
      } else {
        todoLines.push(line);
        continue;
      }
    }
    kept.push(line);
  }
  return {
    summary: substantive(kept) ? kept.join('\n').trim() : '',
    todos: substantive(todoLines) ? todoLines.join('\n').trim() : '',
  };
}

export function resolveMinutes(content: MeetingContentMinutesInput): {
  text: string;
  source: MinutesSource;
} {
  if (content.localMinutesEdited) {
    const local = String(content.localMinutes ?? '');
    if (isEffectiveMinutes(local)) {
      const extracted = splitMinutes(local);
      return { text: extracted.summary || local, source: 'local' };
    }
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
    if (!isEffectiveMinutes(value)) continue;
    const extracted = splitMinutes(String(value));
    if (!extracted.summary) continue;
    return { text: extracted.summary, source };
  }
  return { text: '', source: 'none' };
}

export interface SourceTodo {
  readonly title: string;
  readonly description: string;
}

export function extractSourceTodos(text: string): readonly SourceTodo[] {
  const { todos } = splitMinutes(text);
  if (!todos) return [];
  const items: SourceTodo[] = [];
  for (const line of todos.split('\n')) {
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
