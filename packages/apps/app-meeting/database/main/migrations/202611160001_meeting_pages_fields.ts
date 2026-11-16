import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611160001_meeting_pages_fields',
  async up({ builder }) {
    await builder.alterCollection('meetingContents', (collection) => {
      collection.json('transcriptProvenance').nullable();
    });
    await builder.alterCollection('meetingOaSettings', (collection) => {
      collection.string('meetingUrl', { length: 500 }).nullable();
      collection.string('viewUrl', { length: 500 }).nullable();
      collection.string('scope', { length: 255 }).nullable();
    });
    await builder.alterCollection('meetingOaDrafts', (collection) => {
      collection.text('purpose').nullable();
      collection.text('remark').nullable();
      collection.string('otherAttendPerson', { length: 500 }).nullable();
      collection.json('attendeeSnapshots').nullable();
      collection.json('emceeSnapshot').nullable();
      collection.json('hostSnapshot').nullable();
      collection.json('actualAttendSnapshots').nullable();
      collection.json('copyToSnapshots').nullable();
      collection.string('summaryTitle', { length: 500 }).nullable();
      collection.string('summaryCompleteTime', { length: 32 }).nullable();
    });
    await builder.alterCollection('meetingOaDraftTasks', (collection) => {
      collection.string('appointEmployeeNo', { length: 64 }).nullable();
      collection.string('appointName', { length: 255 }).nullable();
      collection.json('attentionEmployeeNos').nullable();
      collection.json('attentionSnapshots').nullable();
      collection.string('startAt', { length: 32 }).nullable();
    });
    await builder.createCollections([
      {
        name: 'meetingTranscriptRepairs',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('contentId', { length: 64 }).notNull();
          collection.string('action', { length: 32 }).notNull();
          collection.string('reason', { length: 128 }).notNull();
          collection.datetimeTz('createdAt').notNull();
        },
      },
      {
        name: 'meetingSupplementalFiles',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('meetingId', { length: 64 }).notNull();
          collection.string('fileName', { length: 255 }).notNull();
          collection.string('mimeType', { length: 128 }).nullable();
          collection.integer('sizeBytes').notNull();
          collection.string('contentHash', { length: 64 }).notNull();
          collection.string('storageKey', { length: 500 }).notNull();
          collection.string('parseStatus', { length: 32 }).notNull();
          collection.string('parseError', { length: 128 }).nullable();
          collection.text('parsedText').nullable();
          collection.string('uploadedBy', { length: 64 }).notNull();
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
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('meetingSupplementalFiles');
    await builder.dropCollection('meetingTranscriptRepairs');
    await builder.alterCollection('meetingContents', (collection) => {
      collection.dropFields('transcriptProvenance');
    });
    await builder.alterCollection('meetingOaSettings', (collection) => {
      collection.dropFields('meetingUrl', 'viewUrl', 'scope');
    });
    await builder.alterCollection('meetingOaDrafts', (collection) => {
      collection.dropFields(
        'purpose',
        'remark',
        'otherAttendPerson',
        'attendeeSnapshots',
        'emceeSnapshot',
        'hostSnapshot',
        'actualAttendSnapshots',
        'copyToSnapshots',
        'summaryTitle',
        'summaryCompleteTime',
      );
    });
    await builder.alterCollection('meetingOaDraftTasks', (collection) => {
      collection.dropFields(
        'appointEmployeeNo',
        'appointName',
        'attentionEmployeeNos',
        'attentionSnapshots',
        'startAt',
      );
    });
  },
});

export default migration;
