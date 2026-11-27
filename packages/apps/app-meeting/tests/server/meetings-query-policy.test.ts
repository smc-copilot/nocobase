import { expect, test, vi } from 'vitest';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';
import { MeetingQueryService } from '../../server/meetings/service.js';

function policy(): RepositoryPolicy {
  return { read: ['id', 'title', 'meetingCode', 'createdAt'] };
}

function connection(withPolicy: ReturnType<typeof vi.fn>): DatabaseConnection {
  // Meetings go through withPolicy; OA operation/step bookkeeping collections
  // use plain findOne lookups, which list() performs to flag OA-created meetings.
  return {
    repository: (name: string) =>
      name === 'meetings'
        ? { withPolicy }
        : { findOne: vi.fn(async () => undefined) },
  } as unknown as DatabaseConnection;
}

function authz(
  decision: Awaited<ReturnType<AuthorizationContext['authorize']>>,
): AuthorizationContext {
  return {
    authorize: vi.fn(async () => decision),
  } as unknown as AuthorizationContext;
}

test('refuses a list before touching meetings when read is denied', async () => {
  const withPolicy = vi.fn();
  const service = new MeetingQueryService(
    connection(withPolicy),
    authz({ effect: 'deny', reasons: [] }),
  );
  await expect(service.list({ page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
    ApiError,
  );
  expect(withPolicy).not.toHaveBeenCalled();
});

test('lists through withPolicy instead of an unscoped fetch', async () => {
  const readPolicy = policy();
  const findMany = vi.fn(async () => [
    {
      id: 'meeting-alice',
      title: 'Alice planning',
      meetingCode: 'alice-code',
      createdAt: new Date('2026-11-15T00:00:00.000Z'),
    },
  ]);
  const count = vi.fn(async () => 1);
  const findOne = vi.fn();
  const withPolicy = vi.fn(() => ({ findMany, count, findOne }));
  const service = new MeetingQueryService(
    connection(withPolicy),
    authz({
      effect: 'permit',
      reasons: [],
      conditions: { database: { meetings: readPolicy } },
    }),
  );
  await expect(service.list({ page: 1, pageSize: 20 })).resolves.toMatchObject({
    data: [
      {
        id: 'meeting-alice',
        title: 'Alice planning',
        meetingCode: 'alice-code',
      },
    ],
    meta: { page: 1, pageSize: 20, total: 1 },
  });
  expect(withPolicy).toHaveBeenCalledWith(readPolicy);
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findOne).not.toHaveBeenCalled();
});
