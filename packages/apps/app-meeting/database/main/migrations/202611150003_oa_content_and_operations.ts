import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611150003_oa_content_and_operations',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'meetingContents',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.integer('contentVersion').notNull().defaultTo(0);
          collection.string('sourceHash', { length: 64 }).nullable();
          collection.text('originalTranscript').nullable();
          collection.text('optimizedTranscript').nullable();
          collection.text('minutesAiDs').nullable();
          collection.text('minutesAi').nullable();
          collection.text('minutesTopic').nullable();
          collection.text('minutesSpeaker').nullable();
          collection.text('localMinutes').nullable();
          collection.text('localTranscript').nullable();
          collection
            .boolean('localMinutesEdited')
            .notNull()
            .defaultTo(false);
          collection
            .boolean('localTranscriptEdited')
            .notNull()
            .defaultTo(false);
          collection.json('sourceTodos').nullable();
          collection.string('importStatus', { length: 32 }).notNull();
          collection.string('lastImportError', { length: 128 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['meetingId'], { name: 'uk_meeting_contents' });
          collection
            .belongsTo('meeting', 'meetings')
            .targetKey('id')
            .foreignKey('meetingId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingImportRuns',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('recordFileId', { length: 128 }).notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.integer('progress').notNull().defaultTo(0);
          collection.string('errorCode', { length: 128 }).nullable();
          collection.string('sourceHash', { length: 64 }).nullable();
          collection.string('requestedBy', { length: 64 }).notNull();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection
            .belongsTo('meeting', 'meetings')
            .targetKey('id')
            .foreignKey('meetingId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaSettings',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('tokenUrl', { length: 500 }).nullable();
          collection.string('peopleUrl', { length: 500 }).nullable();
          collection.string('clientId', { length: 128 }).nullable();
          collection.text('sealedClientSecret').nullable();
          collection.integer('credentialVersion').notNull().defaultTo(1);
          collection.string('updatedBy', { length: 64 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
        },
      },
      {
        name: 'meetingOaEmployeeMaps',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('userId', { length: 64 }).notNull();
          collection.string('employeeNo', { length: 64 }).notNull();
          collection.string('displayName', { length: 255 }).nullable();
          collection.string('status', { length: 32 }).notNull();
          collection.string('createdBy', { length: 64 }).notNull();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['userId'], { name: 'uk_meeting_oa_map_user' });
        },
      },
      {
        name: 'meetingOaDelegations',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('principalUserId', { length: 64 }).notNull();
          collection.string('delegateUserId', { length: 64 }).notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.string('createdBy', { length: 64 }).notNull();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['principalUserId', 'delegateUserId'], {
            name: 'uk_meeting_oa_delegation',
          });
        },
      },
      {
        name: 'meetingOaDrafts',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.integer('version').notNull().defaultTo(1);
          collection.string('title', { length: 500 }).nullable();
          collection.datetimeTz('startAt').nullable();
          collection.datetimeTz('endAt').nullable();
          collection.string('location', { length: 255 }).nullable();
          collection.json('attendeeEmployeeNos').nullable();
          collection.text('summary').nullable();
          collection.integer('filledFromContentVersion').nullable();
          collection.string('updatedBy', { length: 64 }).notNull();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['meetingId'], { name: 'uk_meeting_oa_draft' });
          collection
            .belongsTo('meeting', 'meetings')
            .targetKey('id')
            .foreignKey('meetingId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaDraftTasks',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('draftId', { length: 64 }).notNull();
          collection.string('clientTaskId', { length: 64 }).notNull();
          collection.string('title', { length: 500 }).notNull();
          collection.string('assigneeEmployeeNo', { length: 64 }).nullable();
          collection.string('assigneeName', { length: 255 }).nullable();
          collection.string('dueAt', { length: 16 }).nullable();
          collection.text('description').nullable();
          collection
            .boolean('fromSourceTodo')
            .notNull()
            .defaultTo(false);
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['draftId', 'clientTaskId'], {
            name: 'uk_meeting_oa_client_task',
          });
          collection
            .belongsTo('draft', 'meetingOaDrafts')
            .targetKey('id')
            .foreignKey('draftId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaOperations',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('oaTarget', { length: 64 }).notNull();
          collection.string('requestId', { length: 64 }).notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.integer('draftVersion').notNull();
          collection.json('frozenPayload').notNull();
          collection.string('creatorUserId', { length: 64 }).notNull();
          collection.string('creatorEmployeeNo', { length: 64 }).notNull();
          collection.string('actorUserId', { length: 64 }).notNull();
          collection.string('denyReason', { length: 128 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['requestId'], {
            name: 'uk_meeting_oa_request',
          });
          collection.unique(['meetingId', 'oaTarget'], {
            name: 'uk_meeting_oa_intent',
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
        name: 'meetingOaSteps',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('operationId', { length: 64 }).notNull();
          collection.string('stepKey', { length: 64 }).notNull();
          collection.integer('sequence').notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.string('externalId', { length: 128 }).nullable();
          collection.string('errorCode', { length: 128 }).nullable();
          collection.datetimeTz('sentAt').nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['operationId', 'stepKey'], {
            name: 'uk_meeting_oa_step',
          });
          collection
            .belongsTo('operation', 'meetingOaOperations')
            .targetKey('id')
            .foreignKey('operationId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaTaskResults',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('operationId', { length: 64 }).notNull();
          collection.string('clientTaskId', { length: 64 }).notNull();
          collection.string('status', { length: 32 }).notNull();
          collection.string('externalTaskId', { length: 128 }).nullable();
          collection.string('errorCode', { length: 128 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['operationId', 'clientTaskId'], {
            name: 'uk_meeting_oa_task_result',
          });
          collection
            .belongsTo('operation', 'meetingOaOperations')
            .targetKey('id')
            .foreignKey('operationId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaOutbox',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('operationId', { length: 64 }).notNull();
          collection.string('wakeStatus', { length: 32 }).notNull();
          collection.integer('leaseVersion').notNull().defaultTo(0);
          collection.datetimeTz('leaseUntil').nullable();
          collection.string('leaseOwner', { length: 64 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['operationId'], {
            name: 'uk_meeting_oa_outbox',
          });
          collection
            .belongsTo('operation', 'meetingOaOperations')
            .targetKey('id')
            .foreignKey('operationId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingOaReconcileRecords',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('operationId', { length: 64 }).notNull();
          collection.string('conclusion', { length: 32 }).notNull();
          collection.text('evidence').notNull();
          collection.string('createdBy', { length: 64 }).notNull();
          collection.datetimeTz('createdAt').notNull();
          collection
            .belongsTo('operation', 'meetingOaOperations')
            .targetKey('id')
            .foreignKey('operationId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: 'meetingAuditEvents',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).nullable();
          collection.string('operationId', { length: 64 }).nullable();
          collection.string('action', { length: 64 }).notNull();
          collection.string('actorUserId', { length: 64 }).nullable();
          collection.json('details').nullable();
          collection.datetimeTz('createdAt').notNull();
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('meetingAuditEvents');
    await builder.dropCollection('meetingOaReconcileRecords');
    await builder.dropCollection('meetingOaOutbox');
    await builder.dropCollection('meetingOaTaskResults');
    await builder.dropCollection('meetingOaSteps');
    await builder.dropCollection('meetingOaOperations');
    await builder.dropCollection('meetingOaDraftTasks');
    await builder.dropCollection('meetingOaDrafts');
    await builder.dropCollection('meetingOaDelegations');
    await builder.dropCollection('meetingOaEmployeeMaps');
    await builder.dropCollection('meetingOaSettings');
    await builder.dropCollection('meetingImportRuns');
    await builder.dropCollection('meetingContents');
  },
});

export default migration;
