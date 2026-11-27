import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611170001_gateway_connection_settings',
  async up({ builder }) {
    await builder.createCollection('meetingGatewaySettings', (collection) => {
      collection.string('id', { length: 64 }).primary().notNull();
      collection.string('origin', { length: 500 }).nullable();
      collection.string('updatedBy', { length: 64 }).nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('meetingGatewaySettings');
  },
});

export default migration;
