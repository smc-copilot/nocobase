import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611180001_participant_join_name',
  async up({ builder }) {
    await builder.alterCollection('meetingParticipants', (collection) => {
      collection.string('joinName', { length: 255 }).nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('meetingParticipants', (collection) => {
      collection.dropFields('joinName');
    });
  },
});

export default migration;
