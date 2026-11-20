import { describe, expect, it } from 'vitest';
import { createHttpMeetingGatewayAdapter } from '../../server/meetings/gateway/http-client.js';
import type { MeetingGatewayConfig } from '../../server/config/meeting-gateway.js';

const hex = 'a'.repeat(64);
const ready: MeetingGatewayConfig = {
  enabled: true,
  origin: 'https://sso.superic.com:8990',
  originAllowlist: ['https://sso.superic.com:8990'],
  resource: 'https://sso.superic.com:8990',
  instanceId: 'anything-llm-local-dev',
  allowedOrigin: 'http://127.0.0.1:13001',
  contractRevision: 'febdcb072a6c36d5b614318150acc86d45e2b35b',
  contractSha256: hex,
  bridgeHmacKey: hex,
  bridgeKeyringJson: JSON.stringify({
    activeKeyId: 'local',
    keys: { local: hex },
  }),
  scopes: [],
  authorizationPathAllowlist: [],
  timeoutMs: 1000,
  queryMaxDays: 93,
  oauthStateTtlMs: 300_000,
  testAdapter: false,
};

const marketplaceAuthorizationUrl =
  'https://meeting.tencent.com/marketplace/authorize.html?corp_id=corp&sdk_id=sdk&redirect_uri=https%3A%2F%2Fmeeting.example%2Fcb&state=abc';

describe('meeting gateway http contract', () => {
  it('starts login with GET and no user token', async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const flowNonce = 'flow-nonce-1';
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        calls.push({
          url,
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              authorization_url: marketplaceAuthorizationUrl,
              transaction_id: 'tx-1',
              expires_at: '2026-11-17T02:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const started = await adapter.startAuthorization({
      accessToken: '',
      applicationId: '',
      returnTo: '',
      flowNonce,
    });
    expect(started.transactionId).toBe('tx-1');
    expect(started.authorizationUrl).toBe(marketplaceAuthorizationUrl);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.authorization).toBeNull();
    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin).toBe('https://sso.superic.com:8990');
    expect(url.pathname).toBe('/api/v1/oauth/authorizations');
    const continueTo = new URL(url.searchParams.get('continue_to') ?? '');
    expect(continueTo.origin).toBe('http://127.0.0.1:13001');
    expect(continueTo.pathname).toBe('/meetings/done');
    expect([...continueTo.searchParams.keys()]).toEqual(['flow_nonce']);
    expect(continueTo.searchParams.get('flow_nonce')).toBe(flowNonce);
  });

  it('rejects an authorization URL that is not the Tencent marketplace shape', async () => {
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              authorization_url:
                'https://meeting.tencent.com/marketplace/authorize.html?corp_id=corp&sdk_id=sdk&redirect_uri=https%3A%2F%2Fmeeting.example%2Fcb&state=abc&extra=1',
              transaction_id: 'tx-1',
              expires_at: '2026-11-17T02:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    await expect(
      adapter.startAuthorization({
        accessToken: '',
        applicationId: '',
        returnTo: '',
        flowNonce: 'flow-nonce-1',
      }),
    ).rejects.toMatchObject({ reason: 'UPSTREAM_CONTRACT_ERROR' });
  });

  it('does not call the gateway when the saved gateway setup is incomplete', async () => {
    let called = false;
    const adapter = createHttpMeetingGatewayAdapter({
      config: { ...ready, contractSha256: undefined },
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 500 });
      },
    });
    await expect(
      adapter.startAuthorization({
        accessToken: '',
        applicationId: '',
        returnTo: '',
      }),
    ).rejects.toMatchObject({ reason: 'GATEWAY_NOT_CONFIGURED' });
    expect(called).toBe(false);
  });

  it('posts a user-window query and treats HTTP 500 as unknown', async () => {
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async (_input, init) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          selection: 'USER_WINDOW',
          connection_ref: '11111111-1111-1111-1111-111111111111',
          target_member_id: '22222222-2222-2222-2222-222222222222',
        });
        return new Response(JSON.stringify({ reason: 'UPSTREAM' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await expect(
      adapter.queryMeetings({
        accessToken: `mt_${'b'.repeat(8)}`,
        connectionRef: '11111111-1111-1111-1111-111111111111',
        memberId: '22222222-2222-2222-2222-222222222222',
        window: {
          startedAt: '2026-11-01T00:00:00.000Z',
          endedAt: '2026-11-01T01:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({
      reason: 'QUERY_RESULT_UNKNOWN',
      status: 'UNAVAILABLE',
    });
  });

  it('fails the transaction poll quickly when the gateway hangs', async () => {
    const adapter = createHttpMeetingGatewayAdapter({
      config: { ...ready, timeoutMs: 30_000 },
      fetchImpl: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('expected abort signal'));
            return;
          }
          if (signal.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        }),
    });
    const started = Date.now();
    await expect(
      adapter.completeAuthorization({ transactionId: 'tx-hang' }),
    ).rejects.toMatchObject({
      reason: 'UPSTREAM_CONTRACT_ERROR',
      message: 'The gateway request timed out.',
    });
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 20_000);

  it('completes authorization anonymously and requires an active connection', async () => {
    const connectionId = '11111111-1111-4111-8111-111111111111';
    const memberId = '22222222-2222-4222-8222-222222222222';
    const accessToken = 'mt_completed_token';
    const calls: {
      pathname: string;
      authorization: string | null;
      search: string;
    }[] = [];
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        calls.push({
          pathname: url.pathname,
          authorization: new Headers(init?.headers).get('authorization'),
          search: url.search,
        });
        if (url.pathname.endsWith('/oauth/authorizations')) {
          return new Response(
            JSON.stringify({
              code: 0,
              error_code: 0,
              data: {
                token_type: 'bearer',
                access_token: accessToken,
                expires_in: 3600,
                connection_id: connectionId,
                member_id: memberId,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              items: [
                {
                  id: connectionId,
                  member_id: memberId,
                  status: 'ACTIVE',
                  name: 'Tencent',
                  kind: 'THIRD_PARTY_OAUTH',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const completed = await adapter.completeAuthorization({
      transactionId: 'tx-9',
    });
    expect(completed).toMatchObject({
      tokenType: 'Bearer',
      accessToken,
      expiresIn: 3600,
      connectionId,
      memberId,
      connectionName: 'Tencent',
    });
    expect(calls[0]).toMatchObject({
      pathname: '/api/v1/oauth/authorizations',
      authorization: null,
    });
    expect(calls[0]?.search).toContain('transaction_id=tx-9');
    expect(calls[1]).toMatchObject({
      pathname: '/api/v1/me/connections',
      authorization: `Bearer ${accessToken}`,
    });
  });

  it('does not accept a completion whose connection is not ACTIVE', async () => {
    const connectionId = '11111111-1111-4111-8111-111111111111';
    const memberId = '22222222-2222-4222-8222-222222222222';
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('transaction_id=')) {
          return new Response(
            JSON.stringify({
              code: 0,
              error_code: 0,
              data: {
                token_type: 'Bearer',
                access_token: 'mt_completed_token',
                expires_in: 3600,
                connection_id: connectionId,
                member_id: memberId,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              items: [
                {
                  id: connectionId,
                  member_id: memberId,
                  status: 'PENDING_CONFIRMATION',
                  name: 'Tencent',
                  kind: 'THIRD_PARTY_OAUTH',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    await expect(
      adapter.completeAuthorization({ transactionId: 'tx-9' }),
    ).rejects.toMatchObject({ reason: 'CONNECTION_NOT_ALLOWED' });
  });

  it('lists participants across pages', async () => {
    const meetingId = 'meet-1';
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        const pos = url.searchParams.get('pos');
        const participants =
          pos === '0'
            ? [
                {
                  uuid: 'p-1',
                  join_name: 'Ada Join',
                  nickname: 'Ada',
                  join_time: 1_700_000_000,
                  department: 'Eng',
                  job_title: 'Dev',
                  is_corp_member: true,
                },
              ]
            : [
                {
                  ms_open_id: 'p-2',
                  nickname: 'Bea',
                  department: '',
                  is_corp_member: false,
                },
              ];
        return new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              meeting_id: meetingId,
              pos: Number(pos),
              size: 20,
              has_remaining: pos === '0',
              next_pos: pos === '0' ? 20 : null,
              participants,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const people = await adapter.listParticipants({
      accessToken: 'mt_people',
      connectionRef: 'conn-1',
      meetingId,
    });
    expect(people).toEqual([
      {
        upstreamParticipantId: 'p-1',
        joinName: 'Ada Join',
        displayName: 'Ada',
        department: 'Eng',
        joinedAt: new Date(1_700_000_000 * 1000).toISOString(),
        jobTitle: 'Dev',
        isCorpMember: true,
      },
      {
        upstreamParticipantId: 'p-2',
        joinName: null,
        displayName: 'Bea',
        department: null,
        joinedAt: null,
        jobTitle: null,
        isCorpMember: false,
      },
    ]);
  });

  it('accepts USER_WINDOW items whose start_at and end_at are ISO strings', async () => {
    const connectionRef = '11111111-1111-4111-8111-111111111111';
    const adapter = createHttpMeetingGatewayAdapter({
      config: ready,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 0,
            error_code: 0,
            data: {
              selection: 'USER_WINDOW',
              meeting_count: 2,
              items: [
                {
                  meeting_id: '2942461386674142628',
                  subject: 'ISO times',
                  meeting_code: '123',
                  state: 'ended',
                  connection_ref: connectionRef,
                  start_at: '2026-11-16T09:30:00+00:00',
                  end_at: '2026-11-16T10:00:00+00:00',
                },
                {
                  meeting_id: '8265947043667851515',
                  subject: 'Unix seconds',
                  meeting_code: '456',
                  state: 'ended',
                  connection_ref: connectionRef,
                  start_at: 1_763_284_869,
                  end_at: 1_763_288_469,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    const meetings = await adapter.queryMeetings({
      accessToken: 'mt_query',
      connectionRef,
      memberId: '22222222-2222-4222-8222-222222222222',
      window: {
        startedAt: '2026-09-30T16:00:00.000Z',
        endedAt: '2026-12-31T15:59:59.999Z',
      },
    });
    expect(meetings).toEqual([
      {
        upstreamMeetingId: '2942461386674142628',
        title: 'ISO times',
        meetingCode: '123',
        startedAt: '2026-11-16T09:30:00.000Z',
        endedAt: '2026-11-16T10:00:00.000Z',
        organizationId: 'anything-llm-local-dev',
        connectionRef,
        cycleKey: 'ended',
      },
      {
        upstreamMeetingId: '8265947043667851515',
        title: 'Unix seconds',
        meetingCode: '456',
        startedAt: new Date(1_763_284_869 * 1000).toISOString(),
        endedAt: new Date(1_763_288_469 * 1000).toISOString(),
        organizationId: 'anything-llm-local-dev',
        connectionRef,
        cycleKey: 'ended',
      },
    ]);
  });
});
