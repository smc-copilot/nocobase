import { expect, test } from 'vitest';
import {
  probeLiveOaOAuth,
  probeLiveOaSession,
} from '../../server/meetings/oa/live-session.js';
import { MeetingOaError } from '../../server/meetings/oa/errors.js';
import type { MeetingOaAdapter } from '../../server/meetings/oa/adapter.js';
import type { OaSsoValidator } from '../../server/meetings/oa/sso-validator.js';

function validator(
  result: Awaited<ReturnType<OaSsoValidator['validate']>>,
): OaSsoValidator {
  return {
    validate: async () => result,
  };
}

function tokenAdapter(impl: MeetingOaAdapter['getToken']): MeetingOaAdapter {
  return {
    kind: 'http',
    writeContract: 'configured',
    tokenContract: 'configured',
    searchPeople: async () => [],
    getToken: impl,
    createMeeting: async () => ({ externalMeetingId: 'm' }),
    uploadSummary: async () => ({
      uploaded: true,
      externalSummaryId: 's',
      externalMeetingId: 'm',
    }),
    createTaskByMeeting: async () => [],
  };
}

test('OAuth probe reports username_missing and oauth_not_configured', async () => {
  await expect(
    probeLiveOaOAuth({
      username: '  ',
      adapter: tokenAdapter(async () => ({
        accessToken: 't',
        expiresAt: new Date().toISOString(),
      })),
      tokenConfigured: true,
    }),
  ).resolves.toMatchObject({ reason: 'username_missing', liveVerified: false });
  await expect(
    probeLiveOaOAuth({
      username: 'smc-sz-hr21007',
      adapter: undefined,
      tokenConfigured: true,
    }),
  ).resolves.toMatchObject({
    reason: 'oauth_not_configured',
    liveVerified: false,
  });
  await expect(
    probeLiveOaOAuth({
      username: 'smc-sz-hr21007',
      adapter: tokenAdapter(async () => ({
        accessToken: 't',
        expiresAt: new Date().toISOString(),
      })),
      tokenConfigured: false,
    }),
  ).resolves.toMatchObject({
    reason: 'oauth_not_configured',
    liveVerified: false,
  });
});

test('OAuth probe maps getToken failures and verifies on success', async () => {
  await expect(
    probeLiveOaOAuth({
      username: 'smc-sz-hr21007',
      adapter: tokenAdapter(async () => {
        throw new MeetingOaError(
          'OA_TOKEN_CONTRACT_UNAVAILABLE',
          'OA authentication request failed.',
          'UNAVAILABLE',
          'NONE',
        );
      }),
      tokenConfigured: true,
    }),
  ).resolves.toMatchObject({ reason: 'unavailable', liveVerified: false });
  await expect(
    probeLiveOaOAuth({
      username: 'smc-sz-hr21007',
      adapter: tokenAdapter(async () => {
        throw new MeetingOaError(
          'OA_TOKEN_CONTRACT_UNAVAILABLE',
          'OA authentication failed.',
          'UNAVAILABLE',
          'NONE',
        );
      }),
      tokenConfigured: true,
    }),
  ).resolves.toMatchObject({ reason: 'rejected', liveVerified: false });
  await expect(
    probeLiveOaOAuth({
      username: ' smc-sz-hr21007 ',
      adapter: tokenAdapter(async () => ({
        accessToken: 'tok',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      tokenConfigured: true,
    }),
  ).resolves.toEqual({
    liveVerified: true,
    employeeNo: 'smc-sz-hr21007',
    reason: 'verified',
  });
});

test('legacy cookie probe still reports sso_disabled when SSO is off', async () => {
  await expect(
    probeLiveOaSession({
      cookieHeader: 'LtpaToken=tok',
      cookieName: 'LtpaToken',
      username: 'smc-sz-hr21007',
      validator: undefined,
      ssoEnabled: true,
    }),
  ).resolves.toEqual({
    liveVerified: false,
    employeeNo: null,
    reason: 'sso_disabled',
  });
  await expect(
    probeLiveOaSession({
      cookieHeader: 'LtpaToken=tok',
      cookieName: 'LtpaToken',
      username: 'smc-sz-hr21007',
      validator: validator({ kind: 'verified', employeeNo: 'smc-sz-hr21007' }),
      ssoEnabled: false,
    }),
  ).resolves.toEqual({
    liveVerified: false,
    employeeNo: null,
    reason: 'sso_disabled',
  });
});
