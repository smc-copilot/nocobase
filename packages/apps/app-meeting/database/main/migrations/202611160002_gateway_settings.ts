import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611160002_gateway_settings',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: 'meetingGatewaySettings',
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('origin', { length: 500 }).nullable();
          collection.string('applicationId', { length: 128 }).nullable();
          collection.string('expectedApplicationId', { length: 128 }).nullable();
          collection.string('clientId', { length: 128 }).nullable();
          collection.text('sealedClientSecret').nullable();
          collection.integer('credentialVersion').notNull().defaultTo(1);
          collection.string('resource', { length: 255 }).nullable();
          collection.json('scopes').nullable();
          collection.string('publicBaseUrl', { length: 500 }).nullable();
          collection.string('tencentCorpId', { length: 128 }).nullable();
          collection.string('tencentSdkId', { length: 128 }).nullable();
          collection.string('callbackRef', { length: 128 }).nullable();
          collection.string('instanceId', { length: 64 }).nullable();
          collection.string('updatedBy', { length: 64 }).nullable();
          collection.datetimeTz('createdAt').notNull();
          collection.datetimeTz('updatedAt').notNull();
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection('meetingGatewaySettings');
  },
});

export default migration;
