import { describe, expect, it, vi } from 'vitest';
import {
  resolveMinutes,
  extractSourceTodos,
} from '../../server/meetings/minutes.js';
import {
  createHttpMeetingOaAdapter,
  mapPerson,
} from '../../server/meetings/oa/http-adapter.js';
import { MeetingOaError } from '../../server/meetings/oa/errors.js';

describe('OA people HTTP contract (oaPeople.js)', () => {
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
            endAt: null,
            location: null,
            attendeeEmployeeNos: [],
          },
          summary: 'S',
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
    expect(
      mapPerson({ fdNo: '1', fdName: 'A', fdDepartment: 'D', id: 'x' }),
    ).toBeNull();
  });
});
