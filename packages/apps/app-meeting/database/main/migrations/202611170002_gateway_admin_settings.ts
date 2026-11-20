import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611170002_gateway_admin_settings',
  async up({ builder }) {
    await builder.alterCollection('meetingGatewaySettings', (collection) => {
      collection.boolean('enabled').nullable();
      collection.string('resource', { length: 500 }).nullable();
      collection.string('instanceId', { length: 128 }).nullable();
      collection.string('allowedOrigin', { length: 500 }).nullable();
      collection.string('contractRevision', { length: 128 }).nullable();
      collection.text('sealedContractSha256').nullable();
      collection.text('sealedBridgeHmacKey').nullable();
      collection.text('sealedBridgeKeyringJson').nullable();
      collection.integer('credentialVersion').notNull().defaultTo(1);
    });
  },
  async down({ builder }) {
    await builder.alterCollection('meetingGatewaySettings', (collection) => {
      collection.dropFields(
        'enabled',
        'resource',
        'instanceId',
        'allowedOrigin',
        'contractRevision',
        'sealedContractSha256',
        'sealedBridgeHmacKey',
        'sealedBridgeKeyringJson',
        'credentialVersion',
      );
    });
  },
});

export default migration;
