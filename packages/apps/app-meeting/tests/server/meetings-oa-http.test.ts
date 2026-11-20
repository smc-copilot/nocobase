import { describe, expect, it, vi } from 'vitest';
import {
  resolveMinutes,
  extractSourceTodos,
  isEffectiveMinutes,
} from '../../server/meetings/minutes.js';
import {
  associateTaskResults,
  createHttpMeetingOaAdapter,
  mapPerson,
} from '../../server/meetings/oa/http-adapter.js';
import { buildUploadSummaryBody } from '../../server/meetings/oa/oa-payload.js';
import { preferredDownloadArtifacts } from '../../server/meetings/gateway/record-files.js';
import { MeetingOaError } from '../../server/meetings/oa/errors.js';
import type { FrozenOaPayload } from '../../server/meetings/oa/adapter.js';
import {
  dueAtToOa,
  isoToBeijingDateTime,
} from '../../server/meetings/oa/beijing-time.js';
import { concatenateGroupTexts } from '../../server/meetings/tencent-groups.js';
import { MeetingContentService } from '../../server/meetings/content-service.js';
import { resolveMeetingOaApiUrls } from '../../server/config/meeting-oa.js';

describe('MEETING_OA_OAUTH_URL and BASE_API_URL', () => {
  it('uses oauthUrl for token and baseApiUrl for meeting writes only', () => {
    expect(
      resolveMeetingOaApiUrls({
        oauthUrl: 'http://oa.example.test/pt/api/oauth.do',
        baseApiUrl:
          'http://oa.example.test/sqm/sysdata/sqmSysdataMeetingApi.do',
        timeoutMs: 5_000,
        testAdapter: false,
      }),
    ).toEqual({
      tokenUrl: 'http://oa.example.test/pt/api/oauth.do',
      meetingUrl: 'http://oa.example.test/sqm/sysdata/sqmSysdataMeetingApi.do',
    });
  });

  it('does not fill tokenUrl from baseApiUrl alone', () => {
    expect(
      resolveMeetingOaApiUrls({
        baseApiUrl: 'http://oa.example.test/MeetingApi.do',
        timeoutMs: 5_000,
        testAdapter: false,
      }),
    ).toEqual({
      tokenUrl: undefined,
      meetingUrl: 'http://oa.example.test/MeetingApi.do',
    });
  });

  it('prefers oauthUrl over tokenUrl; meetingUrl over baseApiUrl', () => {
    expect(
      resolveMeetingOaApiUrls({
        oauthUrl: 'http://oa.example.test/oauth',
        tokenUrl: 'http://oa.example.test/token',
        baseApiUrl: 'http://oa.example.test/base',
        meetingUrl: 'http://oa.example.test/meeting',
        timeoutMs: 5_000,
        testAdapter: false,
      }),
    ).toEqual({
      tokenUrl: 'http://oa.example.test/oauth',
      meetingUrl: 'http://oa.example.test/meeting',
    });
  });

  it('marks contracts from oauthUrl + baseApiUrl + clientId', () => {
    const adapter = createHttpMeetingOaAdapter({
      config: {
        oauthUrl: 'https://oa.example.test/oauth.do',
        baseApiUrl: 'https://oa.example.test/MeetingApi.do',
        clientId: 'client',
        timeoutMs: 5_000,
        testAdapter: false,
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(adapter.writeContract).toBe('configured');
    expect(adapter.tokenContract).toBe('configured');
  });
});

describe('OA people HTTP contract (oaPeople.js)', () => {
  it('throws OA_NOT_CONFIGURED when peopleUrl is missing from env', async () => {
    const adapter = createHttpMeetingOaAdapter({
      config: { timeoutMs: 5_000, testAdapter: false },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(adapter.searchPeople('Alice')).rejects.toMatchObject({
      reason: 'OA_NOT_CONFIGURED',
    });
  });

  it('rejects http peopleUrl unless allowInsecureHttp is enabled', async () => {
    const fetchImpl = vi.fn();
    const blocked = createHttpMeetingOaAdapter({
      config: {
        peopleUrl: 'http://oa.example.test/people',
        timeoutMs: 5_000,
        testAdapter: false,
        allowInsecureHttp: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(blocked.searchPeople('Alice')).rejects.toMatchObject({
      reason: 'OA_NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const allowed = createHttpMeetingOaAdapter({
      config: {
        peopleUrl: 'http://oa.example.test/people',
        timeoutMs: 5_000,
        testAdapter: false,
        allowInsecureHttp: true,
      },
      fetchImpl: vi.fn(async () =>
        Response.json({
          data: [{ fd_no: 'E1', fd_name: 'Alice', fd_department: '' }],
        }),
      ) as unknown as typeof fetch,
    });
    await expect(allowed.searchPeople('Alice')).resolves.toEqual([
      { fd_no: 'E1', fd_name: 'Alice', fd_department: '' },
    ]);
  });

  it('GETs peopleUrl with fd_name and maps fd_no/fd_name/fd_department from data[]', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://oa.example.test');
      expect(url.pathname).toBe('/people');
      expect(url.searchParams.get('fd_name')).toBe('Alice');
      expect(url.username).toBe('');
      return new Response(
        JSON.stringify({
          data: [
            { fd_no: 'E1001', fd_name: 'Alice', fd_department: 'Meeting' },
            { fd_name: '' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const adapter = createHttpMeetingOaAdapter({
      config: {
        peopleUrl: 'https://oa.example.test/people',
        timeoutMs: 5_000,
        testAdapter: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const people = await adapter.searchPeople('Alice');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(people).toEqual([
      { fd_no: 'E1001', fd_name: 'Alice', fd_department: 'Meeting' },
    ]);
  });

  it('reads peopleUrl from env config', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://oa.example.test');
      expect(url.pathname).toBe('/from-env');
      expect(url.searchParams.get('fd_name')).toBe('Alice');
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const adapter = createHttpMeetingOaAdapter({
      config: {
        peopleUrl: 'https://oa.example.test/from-env',
        timeoutMs: 5_000,
        testAdapter: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.searchPeople('Alice');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not send OA write HTTP when createMeeting is called', async () => {
    const fetchImpl = vi.fn();
    const adapter = createHttpMeetingOaAdapter({
      config: { timeoutMs: 5_000, testAdapter: false },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.createMeeting(
        { accessToken: 'x', expiresAt: new Date().toISOString() },
        {
          creatorUserId: 'u',
          creatorEmployeeNo: 'E1',
          oaTarget: 'default',
          meeting: {
            title: 'T',
            startAt: new Date().toISOString(),
            endAt: new Date().toISOString(),
            location: 'Room',
            purpose: 'Aim',
            remark: '',
            attendeeEmployeeNos: ['E1'],
            attendeeSnapshots: [],
            emceeEmployeeNo: null,
            hostEmployeeNo: null,
            otherAttendPerson: null,
          },
          summaryTitle: 'T-会议纪要',
          summary: 'S',
          summaryCompleteTime: '2026-11-16 18:15:00',
          actualAttendEmployeeNos: ['E1'],
          copyToEmployeeNos: [],
          tasks: [],
        },
      ),
    ).rejects.toMatchObject({ reason: 'OA_WRITE_CONTRACT_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not send token HTTP when encoding is unpublished', async () => {
    const fetchImpl = vi.fn();
    const adapter = createHttpMeetingOaAdapter({
      config: {
        tokenUrl: 'https://oa.example.test/token',
        timeoutMs: 5_000,
        testAdapter: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(adapter.getToken('E1001')).rejects.toBeInstanceOf(
      MeetingOaError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('minutes priority and source todos', () => {
  it('prefers local edits then ai_ds_minutes as specified in PRD V1.1', () => {
    expect(
      resolveMinutes({
        localMinutes: 'Local',
        localMinutesEdited: true,
        minutesAiDs: 'DS',
        minutesAi: 'AI',
      }),
    ).toEqual({ text: 'Local', source: 'local' });
    expect(
      resolveMinutes({
        localMinutesEdited: false,
        minutesAi: 'AI',
        minutesAiDs: 'DS',
        minutesTopic: 'Topic',
      }),
    ).toEqual({ text: 'DS', source: 'ai_ds_minutes' });
  });

  it('extracts whitelist to-dos without treating them as assigned tasks', () => {
    expect(
      extractSourceTodos('## 待办事项\n- File the report\n- Call vendor'),
    ).toEqual([
      { title: 'File the report', description: '' },
      { title: 'Call vendor', description: '' },
    ]);
  });

  it('maps oaPeople.js person fields', () => {
    expect(mapPerson({ fd_no: '1', fd_name: 'A', fd_department: 'D' })).toEqual(
      {
        fd_no: '1',
        fd_name: 'A',
        fd_department: 'D',
      },
    );
    expect(mapPerson({ fdNo: '1', fdName: 'A', fdDepartment: 'D' })).toEqual({
      fd_no: '1',
      fd_name: 'A',
      fd_department: 'D',
    });
    expect(mapPerson({ fd_name: 'A' })).toBeNull();
  });

  it('skips empty placeholders and keeps later minutes plus 会议待办', () => {
    expect(isEffectiveMinutes('暂无纪要')).toBe(false);
    expect(
      resolveMinutes({
        minutesAiDs: '暂无纪要\n（注：文档部分内容可能由 AI 生成）',
        minutesAi: '## 会议待办：\n- Call vendor\n## 后续\nKeep this section',
      }),
    ).toEqual({
      text: '## 后续\nKeep this section',
      source: 'ai_minutes',
    });
    expect(
      extractSourceTodos('## 会议待办：\n- Call vendor\n## 后续\nKeep'),
    ).toEqual([{ title: 'Call vendor', description: '' }]);
  });
});

const frozenPayload: FrozenOaPayload = {
  creatorUserId: 'u',
  creatorEmployeeNo: 'E1001',
  oaTarget: 'default',
  meeting: {
    title: 'Contract meeting',
    startAt: '2026-11-16T01:00:00.000Z',
    endAt: '2026-11-16T03:00:00.000Z',
    location: 'Room A',
    purpose: 'Follow-up',
    remark: '',
    attendeeEmployeeNos: ['E1001'],
    attendeeSnapshots: [
      { fd_no: 'E1001', fd_name: 'Alice', fd_department: 'Meeting' },
    ],
    emceeEmployeeNo: 'E1001',
    hostEmployeeNo: 'E1001',
    otherAttendPerson: null,
  },
  summaryTitle: 'Contract meeting-会议纪要',
  summary: 'Minutes body',
  summaryCompleteTime: '2026-11-16 18:15:00',
  actualAttendEmployeeNos: ['E1001'],
  copyToEmployeeNos: [],
  tasks: [
    {
      clientTaskId: 'c-keep',
      title: 'Keep',
      assigneeEmployeeNo: 'E1001',
      assigneeName: 'Alice',
      appointEmployeeNo: 'E1001',
      appointName: 'Alice',
      attentionEmployeeNos: [],
      startAt: null,
      dueAt: '2026-11-20 18:15:00',
      description: null,
    },
    {
      clientTaskId: 'c-lost',
      title: 'Lost',
      assigneeEmployeeNo: 'E1001',
      assigneeName: 'Alice',
      appointEmployeeNo: null,
      appointName: null,
      attentionEmployeeNos: [],
      startAt: null,
      dueAt: '2026-11-20 18:15:00',
      description: null,
    },
  ],
};

describe('OA HTTP token and three writes (local contract)', () => {
  it('sends Basic form+query token and Bearer JSON writes with real summaryId', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/token') {
          expect(url.searchParams.get('grant_type')).toBe('client_credentials');
          expect(url.searchParams.get('employee_no')).toBe('E1001');
          expect(url.searchParams.get('scope')).toBe('oa');
          expect(init?.headers).toMatchObject({
            Authorization: `Basic ${Buffer.from('cid:csecret', 'utf8').toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          });
          expect(String(init?.body)).toContain('grant_type=client_credentials');
          expect(String(init?.body)).toContain('employee_no=E1001');
          return new Response(
            JSON.stringify({
              access_token: 'tok',
              token_type: 'Bearer',
              expires_in: 3600,
              employee_no: 'E1001',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer tok',
          'Content-Type': 'application/json',
        });
        const method = url.searchParams.get('method');
        if (method === 'createMeeting') {
          return new Response(
            JSON.stringify({ X_RETURN_CODE: '200', meetingId: 'oa-meet-1' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (method === 'uploadMeetingSummary') {
          return new Response(
            JSON.stringify({
              X_RETURN_CODE: '200',
              meetingId: 'oa-meet-1',
              summaryId: 'oa-sum-9',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (method === 'createTaskByMeeting') {
          return new Response(
            JSON.stringify({
              X_RETURN_CODE: '200',
              list: [
                { task_name: 'Keep', task_id: 'oa-task-keep', success: true },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(null, { status: 404 });
      },
    );
    const adapter = createHttpMeetingOaAdapter({
      config: {
        tokenUrl: 'https://oa.example.test/token',
        meetingUrl: 'https://oa.example.test/meeting',
        clientId: 'cid',
        clientSecret: 'csecret',
        scope: 'oa',
        timeoutMs: 5_000,
        testAdapter: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const token = await adapter.getToken('E1001');
    const created = await adapter.createMeeting(token, frozenPayload);
    expect(created.externalMeetingId).toBe('oa-meet-1');
    const uploaded = await adapter.uploadSummary(
      token,
      frozenPayload,
      created.externalMeetingId,
    );
    expect(uploaded.externalSummaryId).toBe('oa-sum-9');
    expect(uploaded.externalSummaryId).not.toBe(created.externalMeetingId);
    await expect(
      adapter.createTaskByMeeting(
        token,
        frozenPayload,
        created.externalMeetingId,
      ),
    ).rejects.toMatchObject({ reason: 'OA_UNKNOWN' });
  });
});

describe('tencent group mapping and Beijing time', () => {
  it('concatenates multiple files in order and does not swap markers', () => {
    const grouped = concatenateGroupTexts([
      { group: 'meeting_summary', text: 'ORIGINAL_ONLY first' },
      { group: 'meeting_summary', text: 'ORIGINAL_ONLY second' },
      { group: 'ai_meeting_transcripts', text: 'OPTIMIZED_ONLY' },
    ]);
    expect(grouped.meeting_summary).toBe(
      'ORIGINAL_ONLY first\n\nORIGINAL_ONLY second',
    );
    expect(grouped.ai_meeting_transcripts).toBe('OPTIMIZED_ONLY');
  });

  it('repairs reversed imports only with provenance evidence', () => {
    const repair = MeetingContentService.prototype.planRepair.bind({
      connection: {},
    });
    expect(
      repair({
        transcriptProvenance: { mappingVersion: 'tencent-groups-v1' },
        originalTranscript: 'OPTIMIZED_ONLY',
        optimizedTranscript: 'ORIGINAL_ONLY',
        localTranscriptEdited: false,
        sourceHash: 'abc',
        importStatus: 'succeeded',
      }),
    ).toMatchObject({ action: 'skipped' });
    expect(
      repair({
        transcriptProvenance: { mappingVersion: 'legacy-reversed-unverified' },
        originalTranscript: 'OPTIMIZED_ONLY',
        optimizedTranscript: 'ORIGINAL_ONLY',
        localTranscriptEdited: false,
        sourceHash: 'abc',
        importStatus: 'succeeded',
      }),
    ).toMatchObject({ action: 'swapped' });
    expect(
      repair({
        transcriptProvenance: { mappingVersion: 'legacy-reversed-unverified' },
        originalTranscript: 'OPTIMIZED_ONLY',
        optimizedTranscript: 'ORIGINAL_ONLY',
        localTranscriptEdited: true,
        sourceHash: 'abc',
        importStatus: 'succeeded',
      }),
    ).toMatchObject({ action: 'skipped', reason: 'local-transcript-edit' });
  });

  it('formats date-only due times as Beijing 18:15:00 without browser offset', () => {
    expect(dueAtToOa('2026-11-20')).toBe('2026-11-20 18:15:00');
    expect(isoToBeijingDateTime('2026-11-16T01:00:00.000Z')).toBe(
      '2026-11-16 09:00:00',
    );
  });

  it('uploads summaryCompleteTime as Beijing wall clock, not raw ISO', () => {
    const body = buildUploadSummaryBody(
      {
        ...frozenPayload,
        summaryCompleteTime: '2026-11-16T10:15:00.000Z',
      },
      'oa-meet-1',
    );
    expect(body.summaryCompleteTime).toBe('2026-11-16 18:15:00');
  });

  it('associates unused titles once and leaves extra OA rows unmatched', () => {
    const mapped = associateTaskResults(frozenPayload.tasks, [
      { task_name: 'Keep', task_id: 'oa-keep', success: true },
      { task_name: 'Keep', task_id: 'oa-keep-extra', success: true },
      { task_name: 'Unknown', task_id: 'oa-other', success: true },
    ]);
    expect(mapped).toEqual([
      {
        clientTaskId: 'c-keep',
        status: 'succeeded',
        externalTaskId: 'oa-keep',
        errorCode: null,
      },
    ]);
    expect(mapped.some((row) => row.externalTaskId === 'oa-keep-extra')).toBe(
      false,
    );
  });

  it('concatenates importable txt/md in group order and skips pdf/docx', () => {
    expect(
      preferredDownloadArtifacts({
        meeting_summary: [
          { download_address: 'https://cos.ap-guangzhou.myqcloud.com/a.txt' },
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/a.pdf',
            file_type: 'pdf',
          },
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/b.md',
            file_type: 'md',
          },
        ],
        ai_ds_minutes: [
          {
            download_address: 'https://cos.ap-guangzhou.myqcloud.com/only.docx',
            file_type: 'docx',
          },
        ],
      }),
    ).toEqual([
      {
        group: 'meeting_summary',
        url: 'https://cos.ap-guangzhou.myqcloud.com/a.txt',
        extension: 'txt',
      },
      {
        group: 'meeting_summary',
        url: 'https://cos.ap-guangzhou.myqcloud.com/b.md',
        extension: 'md',
      },
    ]);
  });
});
