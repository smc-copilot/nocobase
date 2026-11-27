import { MeetingGatewayError } from './errors.js';
import type {
  GatewayContentArtifact,
  GatewayRecordFileDetail,
  GatewayRecordFileDocEntry,
  GatewayRecordFileInfoEntry,
  GatewayRecordingRecord,
} from './adapter.js';

export const GROUPS = [
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

function safeSharingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mapRecording(item: unknown): GatewayRecordingRecord {
  if (
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    typeof (item as { record_file_id?: unknown }).record_file_id !== 'string' ||
    !(item as { record_file_id: string }).record_file_id.trim()
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
    sharing_url?: unknown;
    password?: unknown;
    required_same_corp?: unknown;
    required_participant?: unknown;
    file_type?: unknown;
  };
  const allowDownload =
    typeof row.allow_download === 'boolean' ? row.allow_download : null;
  const denied =
    Boolean(row.password) ||
    row.required_same_corp === true ||
    row.required_participant === true ||
    allowDownload === false;
  const expired =
    typeof row.sharing_expire === 'number' &&
    row.sharing_expire > 0 &&
    row.sharing_expire * 1000 < Date.now();
  const permissionUnknown =
    !denied &&
    !expired &&
    allowDownload === null &&
    row.password === undefined &&
    row.required_same_corp === undefined &&
    row.required_participant === undefined;
  const importability =
    denied || expired
      ? 'blocked'
      : permissionUnknown
        ? 'unknown'
        : 'importable';
  return {
    recordFileId: row.record_file_id,
    available: importability !== 'blocked',
    format: typeof row.file_type === 'string' ? row.file_type : null,
    unavailableReason: denied
      ? 'download_denied'
      : expired
        ? 'link_expired'
        : null,
    sharingUrl: safeSharingUrl(row.sharing_url),
    allowDownload,
    importability,
  };
}

/** Prefer the stricter importability when the same record_file_id appears twice. */
export function stricterImportability(
  left: GatewayRecordingRecord['importability'],
  right: GatewayRecordingRecord['importability'],
): GatewayRecordingRecord['importability'] {
  const rank = { blocked: 2, unknown: 1, importable: 0 } as const;
  return rank[left] >= rank[right] ? left : right;
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

/** Unix millis are 13 digits around 2001; smaller finite numbers are unix seconds. */
const RECORD_TIME_MILLIS_THRESHOLD = 1e12;

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function displayFileType(value: unknown): string | null {
  const raw = textOrNull(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/^\./, '');
  if (!normalized) return null;
  return normalized === 'docs' ? 'docx' : normalized;
}

function optionalDownloadUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    assertDownloadUrl(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function instantFromNumeric(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const millis =
    Math.abs(value) >= RECORD_TIME_MILLIS_THRESHOLD ? value : value * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseRecordInstant(value: unknown): string | null {
  if (typeof value === 'number') return instantFromNumeric(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return instantFromNumeric(Number(trimmed));
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseDocGroup(value: unknown): readonly GatewayRecordFileDocEntry[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'A recording content group must be an array.',
      'UNAVAILABLE',
    );
  }
  const entries: GatewayRecordFileDocEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as { file_type?: unknown; download_address?: unknown };
    const downloadUrl = optionalDownloadUrl(row.download_address);
    entries.push({
      fileType: displayFileType(row.file_type),
      downloadUrl,
      available: downloadUrl !== null,
    });
  }
  return entries;
}

function parseRecordInfo(
  value: unknown,
): readonly GatewayRecordFileInfoEntry[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new MeetingGatewayError(
      'UPSTREAM_CONTRACT_ERROR',
      'record_info must be an array.',
      'UNAVAILABLE',
    );
  }
  const entries: GatewayRecordFileInfoEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as {
      user_id?: unknown;
      topic?: unknown;
      start_time?: unknown;
      end_time?: unknown;
    };
    entries.push({
      userId: textOrNull(row.user_id),
      topic: textOrNull(row.topic),
      startAt: parseRecordInstant(row.start_time),
      endAt: parseRecordInstant(row.end_time),
    });
  }
  return entries;
}

function resolveRecordFileId(
  data: Record<string, unknown>,
  recordFileId: string,
): string {
  if (recordFileId.trim()) return recordFileId;
  if (typeof data.record_file_id === 'string' && data.record_file_id.trim()) {
    return data.record_file_id;
  }
  return recordFileId;
}

/**
 * Preview mapping for one record-file detail payload.
 * Every listed format is kept. Illegal media URLs become null and are not fetched.
 * Import still uses preferredDownloadArtifacts, which keeps only txt and md.
 */
export function parseRecordFileDetail(
  data: Record<string, unknown>,
  recordFileId: string,
): GatewayRecordFileDetail {
  return {
    recordFileId: resolveRecordFileId(data, recordFileId),
    viewAddress: optionalDownloadUrl(data.view_address),
    downloadAddress: optionalDownloadUrl(data.download_address),
    downloadAddressFileType: textOrNull(data.download_address_file_type),
    audioAddress: optionalDownloadUrl(data.audio_address),
    audioAddressFileType: textOrNull(data.audio_address_file_type),
    meetingSummary: parseDocGroup(data.meeting_summary),
    aiMeetingTranscripts: parseDocGroup(data.ai_meeting_transcripts),
    aiMinutes: parseDocGroup(data.ai_minutes),
    aiTopicMinutes: parseDocGroup(data.ai_topic_minutes),
    aiSpeakerMinutes: parseDocGroup(data.ai_speaker_minutes),
    aiDsMinutes: parseDocGroup(data.ai_ds_minutes),
    recordInfo: parseRecordInfo(data.record_info),
  };
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
