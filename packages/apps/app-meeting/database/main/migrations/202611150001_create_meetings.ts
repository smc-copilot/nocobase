import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611150001_create_meetings',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'meetings',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('title', { length: 500 }).nullable();
          collection.string('meetingCode', { length: 128 }).nullable();
          collection
            .string('sourceGatewayInstance', { length: 128 })
            .notNull();
          collection.string('sourceOrganization', { length: 128 }).notNull();
          collection
            .string('sourceConnectionRef', { length: 128 })
            .notNull();
          collection
            .string('sourceUpstreamMeetingId', { length: 128 })
            .notNull();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(
            [
              'sourceGatewayInstance',
              'sourceOrganization',
              'sourceConnectionRef',
              'sourceUpstreamMeetingId',
            ],
            { name: 'uk_meetings_source' },
          );
        },
      },
      {
        name: 'meetingAccess',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('userId', { length: 64 }).notNull();
          collection.boolean('canRead').notNull().defaultTo(false);
          collection.boolean('canWrite').notNull().defaultTo(false);
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
          collection.unique(['meetingId', 'userId'], {
            name: 'uk_meeting_access_user',
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
  async down({ builder }) {
    await builder.dropCollection('meetingAccess');
    await builder.dropCollection('meetings');
  },
});

export default migration;
