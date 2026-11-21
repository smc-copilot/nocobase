import { describe, expect, it } from 'vitest';
import { MeetingGatewayError } from '../../server/meetings/gateway/errors.js';
import {
  parseRecordFileDetail,
  parseRecordFileList,
  preferredDownloadArtifacts,
} from '../../server/meetings/gateway/record-files.js';

describe('meeting gateway record-files mapping', () => {
  it('marks password-protected files as blocked and keeps a safe sharing URL', () => {
    const files = parseRecordFileList(
      {
        code: 0,
        error_code: 0,
        data: {
          meeting_id: 'up-1',
          pos: 0,
          size: 20,
          has_remaining: false,
          next_pos: null,
          record_files: [
            {
              record_file_id: 'rec-blocked',
              allow_download: false,
              sharing_url: 'https://example.com/share',
              password: 'secret',
            },
            {
              record_file_id: 'rec-ok',
              allow_download: true,
              sharing_url: 'https://example.com/ok',
            },
            {
              record_file_id: 'rec-unknown',
              sharing_url: 'javascript:alert(1)',
            },
          ],
        },
      },
      'up-1',
      0,
      20,
    );
    expect(files).toEqual([
      expect.objectContaining({
        recordFileId: 'rec-blocked',
        importability: 'blocked',
        allowDownload: false,
        sharingUrl: 'https://example.com/share',
      }),
      expect.objectContaining({
        recordFileId: 'rec-ok',
        importability: 'importable',
        allowDownload: true,
        sharingUrl: 'https://example.com/ok',
      }),
      expect.objectContaining({
        recordFileId: 'rec-unknown',
        importability: 'unknown',
        allowDownload: null,
        sharingUrl: null,
      }),
    ]);
  });
});

describe('parseRecordFileDetail', () => {
  it('keeps every format, normalizes docs, and drops illegal URLs', () => {
    const detail = parseRecordFileDetail(
      {
        record_file_id: 'from-payload',
        view_address: 'https://meeting.tencent.com/user-center/shared-record',
        download_address: 'https://cos.ap-guangzhou.myqcloud.com/media.mp4',
        download_address_file_type: 'mp4',
        audio_address: 'http://cos.ap-guangzhou.myqcloud.com/audio.m4a',
        audio_address_file_type: 'm4a',
        meeting_summary: [
          {
            file_type: 'docs',
            download_address:
              'https://cos.ap-guangzhou.myqcloud.com/summary.docx',
          },
          {
            file_type: 'txt',
            download_address:
              'https://cos.ap-guangzhou.myqcloud.com/summary-1.txt',
          },
          {
            file_type: 'txt',
            download_address:
              'https://cos.ap-guangzhou.myqcloud.com/summary-2.txt',
          },
          {
            file_type: 'pdf',
            download_address: 'https://evil.example/summary.pdf',
          },
        ],
        ai_meeting_transcripts: [],
        ai_minutes: [
          {
            file_type: 'md',
            download_address:
              'https://cos.ap-guangzhou.myqcloud.com/minutes.md',
          },
        ],
        ai_speaker_minutes: [
          {
            file_type: 'docx',
            download_address:
              'https://cos.ap-guangzhou.myqcloud.com/speaker.docx',
          },
        ],
        record_info: [
          {
            user_id: 'user-1',
            topic: 'Planning',
            start_time: 1_700_000_000,
            end_time: 1_700_000_000_500,
          },
          {
            user_id: ' ',
            topic: 'Later',
            start_time: '2026-11-18T03:00:00.000Z',
            end_time: 'not-a-time',
          },
        ],
      },
      'rec-1',
    );
    expect(detail.recordFileId).toBe('rec-1');
    expect(detail.viewAddress).toBe(
      'https://meeting.tencent.com/user-center/shared-record',
    );
    expect(detail.downloadAddress).toBe(
      'https://cos.ap-guangzhou.myqcloud.com/media.mp4',
    );
    expect(detail.downloadAddressFileType).toBe('mp4');
    expect(detail.audioAddress).toBeNull();
    expect(detail.audioAddressFileType).toBe('m4a');
    expect(detail.meetingSummary).toEqual([
      {
        fileType: 'docx',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/summary.docx',
        available: true,
      },
      {
        fileType: 'txt',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/summary-1.txt',
        available: true,
      },
      {
        fileType: 'txt',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/summary-2.txt',
        available: true,
      },
      { fileType: 'pdf', downloadUrl: null, available: false },
    ]);
    expect(detail.aiMeetingTranscripts).toEqual([]);
    expect(detail.aiMinutes).toEqual([
      {
        fileType: 'md',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/minutes.md',
        available: true,
      },
    ]);
    expect(detail.aiTopicMinutes).toEqual([]);
    expect(detail.aiSpeakerMinutes).toEqual([
      {
        fileType: 'docx',
        downloadUrl: 'https://cos.ap-guangzhou.myqcloud.com/speaker.docx',
        available: true,
      },
    ]);
    expect(detail.aiDsMinutes).toEqual([]);
    expect(detail.recordInfo).toEqual([
      {
        userId: 'user-1',
        topic: 'Planning',
        startAt: '2023-11-14T22:13:20.000Z',
        endAt: '2023-11-14T22:13:20.500Z',
      },
      {
        userId: null,
        topic: 'Later',
        startAt: '2026-11-18T03:00:00.000Z',
        endAt: null,
      },
    ]);
  });

  it('uses record_file_id when the caller id is blank and rejects a non-array group', () => {
    expect(
      parseRecordFileDetail({ record_file_id: 'from-payload' }, ' ')
        .recordFileId,
    ).toBe('from-payload');
    expect(() =>
      parseRecordFileDetail({ meeting_summary: { file_type: 'txt' } }, 'rec-1'),
    ).toThrow(MeetingGatewayError);
  });

  it('leaves import selection on txt and md only', () => {
    expect(
      preferredDownloadArtifacts({
        meeting_summary: [
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/a.pdf',
            file_type: 'pdf',
          },
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/a.txt',
            file_type: 'txt',
          },
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/a.md',
            file_type: 'docs',
          },
        ],
      }),
    ).toEqual([
      {
        group: 'meeting_summary',
        url: 'https://cos.ap-guangzhou.myqcloud.com/a.txt',
        extension: 'txt',
      },
    ]);
  });
});
