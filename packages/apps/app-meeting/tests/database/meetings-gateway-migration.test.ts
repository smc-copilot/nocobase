import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'meetings-gateway-schema-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150002_gateway_bind_and_query', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const meetings = await expectCollection('meetings').toExist();
    expect(Object.keys(meetings.fields)).toEqual(
      expect.arrayContaining([
        'sourceCycleKey',
        'startedAt',
        'endedAt',
        'participantFetchStatus',
        'recordingFetchStatus',
      ]),
    );
    await expectCollection('meetingGatewayBindings').toExist();
    await expectCollection('meetingOauthStates').toExist();
    await expectCollection('meetingQueryRuns').toExist();
    await expectCollection('meetingParticipants').toExist();
    await expectCollection('meetingRecordings').toExist();
    await connection.repository('meetings').deleteMany({
      filter: { sourceUpstreamMeetingId: 'up-1' },
    });
    const now = new Date();
    await connection.repository('meetings').createOne({
      values: {
        id: 'meeting-cycle-a',
        title: 'Cycle A',
        meetingCode: 'shared',
        sourceGatewayInstance: 'gw',
        sourceOrganization: 'org',
        sourceConnectionRef: 'conn',
        sourceUpstreamMeetingId: 'up-1',
        sourceCycleKey: 'a',
        participantFetchStatus: 'not_fetched',
        recordingFetchStatus: 'not_fetched',
        createdAt: now,
        updatedAt: now,
      },
    });
    await connection.repository('meetings').createOne({
      values: {
        id: 'meeting-cycle-b',
        title: 'Cycle B',
        meetingCode: 'shared',
        sourceGatewayInstance: 'gw',
        sourceOrganization: 'org',
        sourceConnectionRef: 'conn',
        sourceUpstreamMeetingId: 'up-1',
        sourceCycleKey: 'b',
        participantFetchStatus: 'not_fetched',
        recordingFetchStatus: 'not_fetched',
        createdAt: now,
        updatedAt: now,
      },
    });
    await expect(
      connection.repository('meetings').createOne({
        values: {
          id: 'meeting-cycle-dup',
          title: 'Dup',
          meetingCode: 'shared',
          sourceGatewayInstance: 'gw',
          sourceOrganization: 'org',
          sourceConnectionRef: 'conn',
          sourceUpstreamMeetingId: 'up-1',
          sourceCycleKey: 'a',
          participantFetchStatus: 'not_fetched',
          recordingFetchStatus: 'not_fetched',
          createdAt: now,
          updatedAt: now,
        },
      }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('meetingRecordings').not.toExist();
    await expectCollection('meetingGatewayBindings').not.toExist();
  },
});

describeMigration('202611180001_participant_join_name', {
  sources,
  up: async ({ expectCollection }) => {
    const participants = await expectCollection(
      'meetingParticipants',
    ).toExist();
    expect(Object.keys(participants.fields)).toEqual(
      expect.arrayContaining(['joinName', 'displayName', 'jobTitle']),
    );
  },
});
