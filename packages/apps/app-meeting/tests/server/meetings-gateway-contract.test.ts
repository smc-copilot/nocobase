import { expect, test } from 'vitest';
import { createHttpMeetingGatewayAdapter } from '../../server/meetings/gateway/http-client.js';
import { MeetingGatewayError } from '../../server/meetings/gateway/errors.js';
import { validateHttpsOrigin } from '../../server/meetings/gateway/origin.js';
import { inclusiveQueryDays } from '../../server/meetings/query-run-service.js';
import {
  collectGatewayPages,
  withReadonlyRetry,
} from '../../server/meetings/gateway/pagination.js';
import { validateAuthorizationUrl } from '../../server/meetings/gateway/oauth-url.js';

const config = {
  origin: 'https://gateway.example.test',
  originAllowlist: ['https://gateway.example.test'],
  applicationId: 'app-meeting',
  expectedApplicationId: 'app-meeting',
  callbackRef: 'cb1',
  tencentCorpId: 'corp',
  tencentSdkId: 'sdk',
  authorizationPathAllowlist: ['/oauth'],
  scopes: [] as const,
  timeoutMs: 15_000,
  queryMaxDays: 93,
  oauthStateTtlMs: 300_000,
  testAdapter: false,
};

test('counts Beijing calendar days so a 93-day +08 window is accepted', () => {
  expect(
    inclusiveQueryDays(
      new Date('2026-01-01T00:00:00+08:00'),
      new Date('2026-04-03T23:59:59.999+08:00'),
    ),
  ).toBe(93);
});

test('rejects a non-allowlisted origin', () => {
  expect(() => validateHttpsOrigin('http://gateway.example.test')).toThrow(
    'CONFIG_INVALID',
  );
  expect(() => validateHttpsOrigin('https://127.0.0.1/')).toThrow(
    'CONFIG_INVALID',
  );
});

test('HTTP query methods stay blocked without a published client.js contract', async () => {
  const adapter = createHttpMeetingGatewayAdapter({ config });
  await expect(
    adapter.queryMeetings({
      accessToken: 'mt_x',
      connectionRef: 'c',
      memberId: 'm',
      window: {
        startedAt: '2026-11-01T00:00:00.000Z',
        endedAt: '2026-11-02T00:00:00.000Z',
      },
    }),
  ).rejects.toMatchObject({ reason: 'UPSTREAM_CONTRACT_ERROR' });
});

test('validates the published Tencent authorization URL shape', () => {
  const tencent = {
    applicationId: 'app-meeting',
    expectedApplicationId: 'app-meeting',
    callbackRef: 'cb1',
    corpId: 'corp',
    sdkId: 'sdk',
    callbackUri: 'https://gateway.example.test/callbacks/tencent/oauth/cb1',
    returnTo:
      'https://meetings.example.test/settings/meeting-connections/callback',
  };
  const url =
    'https://meeting.tencent.com/oauth?corp_id=corp&sdk_id=sdk&redirect_uri=https%3A%2F%2Fgateway.example.test%2Fcallbacks%2Ftencent%2Foauth%2Fcb1&state=abc';
  expect(
    validateAuthorizationUrl(url, {
      allowedPaths: ['/oauth'],
      config: tencent,
    }),
  ).toBe(url);
  expect(() =>
    validateAuthorizationUrl(
      'https://evil.example/oauth?corp_id=corp&sdk_id=sdk&redirect_uri=https%3A%2F%2Fgateway.example.test%2Fcallbacks%2Ftencent%2Foauth%2Fcb1&state=abc',
      { allowedPaths: ['/oauth'], config: tencent },
    ),
  ).toThrow(MeetingGatewayError);
});

test('detects a looping pagination cursor and keeps unique items', async () => {
  await expect(
    collectGatewayPages({
      meetingId: 'm1',
      pageSize: 1,
      itemId: (item) => item.id,
      fetchPage: async () => ({
        meetingId: 'm1',
        pos: 0,
        size: 1,
        hasRemaining: true,
        nextPos: 0,
        items: [{ id: 'a' }],
      }),
    }),
  ).rejects.toMatchObject({ reason: 'UPSTREAM_CONTRACT_ERROR' });
  const pages = [
    {
      meetingId: 'm1',
      pos: 0,
      size: 1,
      hasRemaining: true,
      nextPos: 1,
      items: [{ id: 'a' }],
    },
    {
      meetingId: 'm1',
      pos: 1,
      size: 1,
      hasRemaining: false,
      nextPos: null,
      items: [{ id: 'a' }, { id: 'b' }],
    },
  ];
  let index = 0;
  await expect(
    collectGatewayPages({
      meetingId: 'm1',
      pageSize: 1,
      itemId: (item) => item.id,
      fetchPage: async () => pages[index++]!,
    }),
  ).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
});

test('retries only retryable gateway reads', async () => {
  let attempts = 0;
  await expect(
    withReadonlyRetry(
      async () => {
        attempts += 1;
        throw new MeetingGatewayError(
          'UPSTREAM_CONTRACT_ERROR',
          'temp',
          'UNAVAILABLE',
          true,
        );
      },
      { delaysMs: [0, 0], sleep: async () => undefined },
    ),
  ).rejects.toBeInstanceOf(MeetingGatewayError);
  expect(attempts).toBe(3);
});

test('skips failed recording downloads and does not store error HTML', async () => {
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/record-files/rec-1') && !url.includes('myqcloud')) {
      return new Response(
        JSON.stringify({
          code: 0,
          error_code: 0,
          data: {
            meeting_summary: [
              {
                download_address:
                  'https://cos.ap-guangzhou.myqcloud.com/fail.txt',
              },
              {
                download_address:
                  'https://cos.ap-guangzhou.myqcloud.com/ok.txt',
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/fail.txt')) {
      return new Response('<html>denied</html>', { status: 403 });
    }
    if (url.endsWith('/ok.txt')) {
      return new Response('ORIGINAL_ONLY isolation dialogue', { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  const adapter = createHttpMeetingGatewayAdapter({
    config,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const imported = await adapter.importRecordingContent!({
    accessToken: 'mt_x',
    connectionRef: 'conn-1',
    recordFileId: 'rec-1',
  });
  expect(imported.map((item) => item.text)).toEqual([
    'ORIGINAL_ONLY isolation dialogue',
  ]);
  expect(imported.some((item) => item.text.includes('denied'))).toBe(false);
});
