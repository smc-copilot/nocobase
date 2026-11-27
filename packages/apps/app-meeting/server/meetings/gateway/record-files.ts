import { MeetingGatewayError } from './errors.js';
import type {
  GatewayContentArtifact,
  GatewayRecordingRecord,
} from './adapter.js';

const GROUPS = [
  'meeting_summary',
  'ai_meeting_transcripts',
  'ai_minutes',
  'ai_topic_minutes',
  'ai_speaker_minutes',
  'ai_ds_minutes',
] as const;

export const RECORDING_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

function envelopeData(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { code?: unknown }).code !== 0 ||
    (value as { error_code?: unknown }).error_code !== 0 ||
    !(value as { data?: unknown }).data ||
    typeof (value as { data?: unknown }).data !== 'object' ||
    Array.isArray((value as { data?: unknown }).data)
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'The gateway response did not match the published recording envelope.',
      'UNAVAILABLE',
    );
  }
  return (value as { data: Record<string, unknown> }).data;
}

export function parseRecordFileList(
  envelope: unknown,
  meetingId: string,
  pos: number,
  pageSize: number,
): readonly GatewayRecordingRecord[] {
  const data = envelopeData(envelope);
  if (Array.isArray(data.record_meetings)) {
    const files: GatewayRecordingRecord[] = [];
    for (const record of data.record_meetings) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'A record_meetings item did not match the published contract.',
          'UNAVAILABLE',
        );
      }
      const row = record as { meeting_id?: unknown; record_files?: unknown };
      if (row.meeting_id !== meetingId || !Array.isArray(row.record_files)) {
        continue;
      }
      for (const item of row.record_files) {
        files.push(mapRecording(item));
      }
    }
    return files;
  }
  if (
    data.meeting_id !== meetingId ||
    data.pos !== pos ||
    data.size !== pageSize ||
    typeof data.has_remaining !== 'boolean' ||
    !Array.isArray(data.record_files) ||
    (data.has_remaining &&
      (!Number.isSafeInteger(data.next_pos) || Number(data.next_pos) <= pos)) ||
    (!data.has_remaining && data.next_pos !== null)
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'The record-files page did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  return data.record_files.map(mapRecording);
}

function mapRecording(item: unknown): GatewayRecordingRecord {
  if (
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    typeof (item as { record_file_id?: unknown }).record_file_id !== 'string'
  ) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A record file item did not match the published contract.',
      'UNAVAILABLE',
    );
  }
  const row = item as {
    record_file_id: string;
    allow_download?: unknown;
    sharing_expire?: unknown;
    password?: unknown;
    required_same_corp?: unknown;
    required_participant?: unknown;
    file_type?: unknown;
  };
  const denied =
    row.password ||
    row.required_same_corp === true ||
    row.required_participant === true ||
    row.allow_download === false;
  const expired =
    typeof row.sharing_expire === 'number' &&
    row.sharing_expire > 0 &&
    row.sharing_expire * 1000 < Date.now();
  return {
    recordFileId: row.record_file_id,
    available: !denied && !expired,
    format: typeof row.file_type === 'string' ? row.file_type : null,
    unavailableReason: denied
      ? 'download_denied'
      : expired
        ? 'link_expired'
        : null,
  };
}

export function preferredDownloadArtifacts(
  data: Record<string, unknown>,
): { group: (typeof GROUPS)[number]; url: string; extension: string }[] {
  const selected: {
    group: (typeof GROUPS)[number];
    url: string;
    extension: string;
  }[] = [];
  for (const key of Object.keys(data)) {
    if (
      (key.startsWith('ai_') || key === 'meeting_summary') &&
      !GROUPS.includes(key as (typeof GROUPS)[number])
    ) {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'The recording details included an unknown content group.',
        'UNAVAILABLE',
      );
    }
  }
  for (const group of GROUPS) {
    const rows = data[group];
    if (rows == null) continue;
    if (!Array.isArray(rows)) {
      throw new MeetingGatewayError(
        'UPSTREAM_CONTRACT_ERROR',
        'A recording content group must be an array.',
        'UNAVAILABLE',
      );
    }
    for (const item of rows) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const address = (item as { download_address?: unknown }).download_address;
      if (typeof address !== 'string' || !address) continue;
      const fileType = (item as { file_type?: unknown }).file_type;
      const rawType = (
        typeof fileType === 'string' && fileType.trim() ? fileType : 'txt'
      )
        .toLowerCase()
        .replace(/^\./, '');
      const extension = rawType === 'docs' ? 'docx' : rawType;
      if (extension !== 'txt' && extension !== 'md') continue;
      selected.push({ group, url: address, extension });
    }
  }
  return selected;
}

export function assertDownloadUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MeetingGatewayError(
      'SOURCE_NOT_IMPORTABLE',
      'The recording download URL was rejected.',
      'FAILED_PRECONDITION',
    );
  }
  const allowed = /(?:^|\.)(?:tencent\.com|qcloud\.com|myqcloud\.com)$/i.test(
    url.hostname,
  );
  if (url.protocol !== 'https:' || url.username || url.password || !allowed) {
    throw new MeetingGatewayError(
      'SOURCE_NOT_IMPORTABLE',
      'The recording download URL was rejected.',
      'FAILED_PRECONDITION',
    );
  }
  return url;
}

export function artifactsFromText(
  group: string,
  text: string,
): GatewayContentArtifact {
  return {
    group: group as GatewayContentArtifact['group'],
    text,
  };
}
