import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'meetings-schema-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150001_create_meetings', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const meetings = await expectCollection('meetings').toExist();
    expect(Object.keys(meetings.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'meetingCode',
        'sourceGatewayInstance',
        'sourceOrganization',
        'sourceConnectionRef',
        'sourceUpstreamMeetingId',
        'createdAt',
        'updatedAt',
      ]),
    );
    const access = await expectCollection('meetingAccess').toExist();
    expect(Object.keys(access.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'meetingId',
        'userId',
        'canRead',
        'canWrite',
        'createdAt',
        'updatedAt',
      ]),
    );
    const now = new Date();
    await connection.repository('meetings').createOne({
      values: {
        id: 'meeting-1',
        title: 'Planning',
        meetingCode: 'code-1',
        sourceGatewayInstance: 'gw',
        sourceOrganization: 'org',
        sourceConnectionRef: 'conn',
        sourceUpstreamMeetingId: 'up-1',
        createdAt: now,
        updatedAt: now,
      },
    });
    await connection.repository('meetingAccess').createOne({
      values: {
        id: 'access-1',
        meetingId: 'meeting-1',
        userId: 'user-1',
        canRead: true,
        canWrite: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    await expect(
      connection.repository('meetings').createOne({
        values: {
          id: 'meeting-2',
          title: 'Duplicate source',
          meetingCode: null,
          sourceGatewayInstance: 'gw',
          sourceOrganization: 'org',
          sourceConnectionRef: 'conn',
          sourceUpstreamMeetingId: 'up-1',
          createdAt: now,
          updatedAt: now,
        },
      }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('meetingAccess').not.toExist();
    await expectCollection('meetings').not.toExist();
  },
});
