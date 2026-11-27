import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611150002_gateway_bind_and_query',
  async up({ builder }) {
    await builder.alterCollection('meetings', (collection) => {
      collection
        .string('sourceCycleKey', { length: 128 })
        .notNull()
        .defaultTo('');
      collection.datetimeTz('startedAt').nullable();
      collection.datetimeTz('endedAt').nullable();
      collection
        .string('participantFetchStatus', { length: 32 })
        .notNull()
        .defaultTo('not_fetched');
      collection
        .string('recordingFetchStatus', { length: 32 })
        .notNull()
        .defaultTo('not_fetched');
    });
    await builder.dropConstraint('meetings', 'uk_meetings_source');
    await builder.alterCollection('meetings', (collection) => {
      collection.unique(
        [
          'sourceGatewayInstance',
          'sourceOrganization',
          'sourceConnectionRef',
          'sourceUpstreamMeetingId',
          'sourceCycleKey',
        ],
        { name: 'uk_meetings_source_cycle' },
      );
    });
    await builder.createCollections([
      {
        name: 'meetingGatewayBindings',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('userId', { length: 64 }).notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.string('gatewayInstanceId', { length: 128 }).notNull();
          collection.string('organizationId', { length: 128 }).nullable();
          collection.string('gatewayMemberId', { length: 128 }).nullable();
          collection.string('connectionRef', { length: 128 }).nullable();
          collection.string('connectionName', { length: 255 }).nullable();
          collection.string('connectionType', { length: 64 }).nullable();
          collection.integer('credentialVersion').notNull().defaultTo(1);
          collection.text('sealedAccessToken').nullable();
          collection.text('sealedRefreshToken').nullable();
          collection.datetimeTz('tokenExpiresAt').nullable();
          collection
            .boolean('disconnectRevokesUpstream')
            .notNull()
            .defaultTo(false);
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['userId', 'gatewayInstanceId'], {
            name: 'uk_meeting_gateway_binding_user_instance',
          });
        },
      },
      {
        name: 'meetingOauthStates',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('userId', { length: 64 }).notNull();
          collection.datetimeTz('expiresAt').notNull();
          collection.datetimeTz('consumedAt').nullable();
          collection.string('transactionId', { length: 128 }).nullable();
          collection.text('sealedAccessToken').nullable();
          collection.string('returnTo', { length: 500 }).notNull();
          collection.datetimeTz('createdAt').notNull();
        },
      },
      {
        name: 'meetingQueryRuns',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('userId', { length: 64 }).notNull();
          collection.string('bindingId', { length: 64 }).notNull();
          collection.string('connectionRef', { length: 128 }).notNull();
          collection.string('memberId', { length: 128 }).notNull();
          collection.datetimeTz('startedAt').notNull();
          collection.datetimeTz('endedAt').notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.string('errorReason', { length: 64 }).nullable();
          collection.integer('meetingCount').nullable();
          collection.datetimeTz('startedAtClock').notNull();
          collection.datetimeTz('finishedAt').nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
        },
      },
      {
        name: 'meetingParticipants',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection
            .string('upstreamParticipantId', { length: 128 })
            .notNull();
          collection.string('displayName', { length: 255 }).nullable();
          collection.string('department', { length: 255 }).nullable();
          collection.datetimeTz('joinedAt').nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['meetingId', 'upstreamParticipantId'], {
            name: 'uk_meeting_participant_source',
          });
          collection
            .belongsTo('meeting', 'meetings')
            .targetKey('id')
            .foreignKey('meetingId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingRecordings',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('recordFileId', { length: 128 }).notNull();
          collection.boolean('available').notNull().defaultTo(false);
          collection.string('format', { length: 32 }).nullable();
          collection.string('unavailableReason', { length: 64 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['meetingId', 'recordFileId'], {
            name: 'uk_meeting_recording_source',
          });
          collection
            .belongsTo('meeting', 'meetings')
            .targetKey('id')
            .foreignKey('meetingId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
    ]);
  },
  async down({ builder, query }) {
    await builder.dropCollection('meetingRecordings');
    await builder.dropCollection('meetingParticipants');
    await builder.dropCollection('meetingQueryRuns');
    await builder.dropCollection('meetingOauthStates');
    await builder.dropCollection('meetingGatewayBindings');
    await builder.dropConstraint('meetings', 'uk_meetings_source_cycle');
    // Cycle rows cannot survive the previous unique. Keep one meeting per old
    // source key so rollback restores that schema without colliding.
    const rows = await query
      .selectFrom('meetings')
      .select([
        'id',
        'sourceGatewayInstance',
        'sourceOrganization',
        'sourceConnectionRef',
        'sourceUpstreamMeetingId',
      ])
      .orderBy('id', 'asc')
      .execute();
    const seen = new Set<string>();
    const extra: string[] = [];
    for (const row of rows) {
      const key = [
        row.sourceGatewayInstance,
        row.sourceOrganization,
        row.sourceConnectionRef,
        row.sourceUpstreamMeetingId,
      ].join('\0');
      if (seen.has(key)) extra.push(String(row.id));
      else seen.add(key);
    }
    if (extra.length > 0) {
      await query.deleteFrom('meetings').where('id', 'in', extra).execute();
    }
    await builder.alterCollection('meetings', (collection) => {
      collection.dropFields(
        'sourceCycleKey',
        'startedAt',
        'endedAt',
        'participantFetchStatus',
        'recordingFetchStatus',
      );
      collection.unique(
        [
          'sourceGatewayInstance',
          'sourceOrganization',
          'sourceConnectionRef',
          'sourceUpstreamMeetingId',
        ],
        { name: 'uk_meetings_source' },
      );
    });
  },
});

export default migration;
