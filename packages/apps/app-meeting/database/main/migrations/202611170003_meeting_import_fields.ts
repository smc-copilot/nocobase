import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611170003_meeting_import_fields',
  async up({ builder }) {
    await builder.alterCollection('meetingRecordings', (collection) => {
      collection.string('sharingUrl', { length: 2000 }).nullable();
      collection.boolean('allowDownload').nullable();
      collection
        .string('importability', { length: 32 })
        .notNull()
        .defaultTo('unknown');
    });
    await builder.alterCollection('meetingParticipants', (collection) => {
      collection.string('jobTitle', { length: 255 }).nullable();
      collection.boolean('isCorpMember').nullable();
    });
    await builder.alterCollection('meetings', (collection) => {
      collection.string('queryAnomaly', { length: 128 }).nullable();
      collection
        .string('importState', { length: 32 })
        .notNull()
        .defaultTo('not_imported');
    });
  },
  async down({ builder }) {
    await builder.alterCollection('meetingRecordings', (collection) => {
      collection.dropFields('sharingUrl', 'allowDownload', 'importability');
    });
    await builder.alterCollection('meetingParticipants', (collection) => {
      collection.dropFields('jobTitle', 'isCorpMember');
    });
    await builder.alterCollection('meetings', (collection) => {
      collection.dropFields('queryAnomaly', 'importState');
    });
  },
});

export default migration;
