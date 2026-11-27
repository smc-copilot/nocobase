export const TENCENT_MINUTE_GROUPS = [
  'ai_ds_minutes',
  'ai_minutes',
  'ai_topic_minutes',
  'ai_speaker_minutes',
] as const;

export const TENCENT_CONTENT_GROUPS = [
  'meeting_summary',
  'ai_meeting_transcripts',
  ...TENCENT_MINUTE_GROUPS,
] as const;

export type TencentContentGroup = (typeof TENCENT_CONTENT_GROUPS)[number];

export interface GroupedArtifact {
  readonly group: string;
  readonly text: string;
}

export function concatenateGroupTexts(
  artifacts: readonly GroupedArtifact[],
): Record<TencentContentGroup, string> {
  const buckets: Record<string, string[]> = {};
  for (const group of TENCENT_CONTENT_GROUPS) buckets[group] = [];
  for (const item of artifacts) {
    if (!TENCENT_CONTENT_GROUPS.includes(item.group as TencentContentGroup)) {
      continue;
    }
    const text = String(item.text ?? '').trim();
    if (!text) continue;
    buckets[item.group].push(String(item.text));
  }
  return {
    meeting_summary: buckets.meeting_summary.join('\n\n'),
    ai_meeting_transcripts: buckets.ai_meeting_transcripts.join('\n\n'),
    ai_ds_minutes: buckets.ai_ds_minutes.join('\n\n'),
    ai_minutes: buckets.ai_minutes.join('\n\n'),
    ai_topic_minutes: buckets.ai_topic_minutes.join('\n\n'),
    ai_speaker_minutes: buckets.ai_speaker_minutes.join('\n\n'),
  };
}

export interface TranscriptProvenance {
  readonly mappingVersion: string;
  readonly originalGroup: 'meeting_summary' | 'ai_meeting_transcripts' | null;
  readonly optimizedGroup: 'meeting_summary' | 'ai_meeting_transcripts' | null;
  readonly repairedAt?: string;
  readonly skippedReason?: string;
}

export const TENCENT_GROUPS_V1 = 'tencent-groups-v1';
export const LEGACY_REVERSED = 'legacy-reversed-unverified';
export const LEGACY_REPAIRED = 'legacy-reversed-repaired';

export function alignedProvenance(): TranscriptProvenance {
  return {
    mappingVersion: TENCENT_GROUPS_V1,
    originalGroup: 'meeting_summary',
    optimizedGroup: 'ai_meeting_transcripts',
  };
}
