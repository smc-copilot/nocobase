import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'meetings-oa-schema-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150003_oa_content_and_operations', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('meetings').toExist();
    await expectCollection('meetingGatewayBindings').toExist();
    await expectCollection('meetingQueryRuns').toExist();
    await expectCollection('meetingContents').toExist();
    await expectCollection('meetingImportRuns').toExist();
    await expectCollection('meetingOaDrafts').toExist();
    await expectCollection('meetingOaOperations').toExist();
    await expectCollection('meetingOaSteps').toExist();
    await expectCollection('meetingOaTaskResults').toExist();
    await expectCollection('meetingOaOutbox').toExist();
    await expectCollection('meetingOaReconcileRecords').toExist();
    const now = new Date();
    const meeting = await connection
      .repository('meetings')
      .findOne({ filter: { id: 'meeting-oa-unique' } });
    if (!meeting) {
      await connection.repository('meetings').createOne({
        values: {
          id: 'meeting-oa-unique',
          title: 'OA unique',
          sourceGatewayInstance: 'gw-oa',
          sourceOrganization: 'org-oa',
          sourceConnectionRef: 'conn-oa',
          sourceUpstreamMeetingId: 'up-oa',
          sourceCycleKey: '',
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    await connection.repository('meetingOaOperations').createOne({
      values: {
        id: 'op-1',
        meetingId: 'meeting-oa-unique',
        oaTarget: 'default',
        requestId: 'req-1',
        status: 'pending',
        draftVersion: 1,
        frozenPayload: { oaTarget: 'default' },
        creatorUserId: 'u1',
        creatorEmployeeNo: 'E1',
        actorUserId: 'u1',
        createdAt: now,
        updatedAt: now,
      },
    });
    await expect(
      connection.repository('meetingOaOperations').createOne({
        values: {
          id: 'op-2',
          meetingId: 'meeting-oa-unique',
          oaTarget: 'default',
          requestId: 'req-2',
          status: 'pending',
          draftVersion: 1,
          frozenPayload: { oaTarget: 'default' },
          creatorUserId: 'u1',
          creatorEmployeeNo: 'E1',
          actorUserId: 'u1',
          createdAt: now,
          updatedAt: now,
        },
      }),
    ).rejects.toThrow();
  },
});

describeMigration('202611160001_meeting_pages_fields', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('meetingOaDrafts').toExist();
    await expectCollection('meetingTranscriptRepairs').toExist();
    await expectCollection('meetingSupplementalFiles').toExist();
    const now = new Date();
    await connection.repository('meetingTranscriptRepairs').createOne({
      values: {
        id: 'repair-1',
        meetingId: 'meeting-oa-unique',
        contentId: 'content-1',
        action: 'skipped',
        reason: 'no-import-evidence',
        createdAt: now,
      },
    });
  },
});
