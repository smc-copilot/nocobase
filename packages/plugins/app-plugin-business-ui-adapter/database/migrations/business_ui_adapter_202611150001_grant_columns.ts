import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Associates connections with an agent client and stamps tickets, embeds, and
 * interactions with the grant that authorized them. Legacy subject-binding
 * columns stay; new rows leave `subjectBindingId` null and old rows without a
 * grant fail closed at read time.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'business_ui_adapter_202611150001_grant_columns',

  async up({ builder }) {
    await builder.alterCollection('businessUiConnections', (collection) => {
      collection.string('clientId', { length: 255 }).nullable();
    });

    await builder.alterCollection('businessUiTickets', (collection) => {
      collection.string('grantId', { length: 64 }).nullable();
      collection.integer('grantRevision').nullable();
      collection.string('clientId', { length: 255 }).nullable();
    });
    await builder.alterField('businessUiTickets', 'subjectBindingId', {
      type: 'string',
      length: 64,
      nullable: true,
    });

    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.string('grantId', { length: 64 }).nullable();
      collection.integer('grantRevision').nullable();
      collection.string('clientId', { length: 255 }).nullable();
    });

    await builder.alterCollection('businessUiInteractions', (collection) => {
      collection.string('grantId', { length: 64 }).nullable();
      collection.integer('grantRevision').nullable();
      collection.string('clientId', { length: 255 }).nullable();
    });
    await builder.alterField('businessUiInteractions', 'subjectBindingId', {
      type: 'string',
      length: 64,
      nullable: true,
    });
  },

  async down({ builder }) {
    await builder.alterField('businessUiInteractions', 'subjectBindingId', {
      type: 'string',
      length: 64,
      nullable: false,
    });
    await builder.alterCollection('businessUiInteractions', (collection) => {
      collection.dropField('clientId');
      collection.dropField('grantRevision');
      collection.dropField('grantId');
    });

    await builder.alterCollection('businessUiEmbedContexts', (collection) => {
      collection.dropField('clientId');
      collection.dropField('grantRevision');
      collection.dropField('grantId');
    });

    await builder.alterField('businessUiTickets', 'subjectBindingId', {
      type: 'string',
      length: 64,
      nullable: false,
    });
    await builder.alterCollection('businessUiTickets', (collection) => {
      collection.dropField('clientId');
      collection.dropField('grantRevision');
      collection.dropField('grantId');
    });

    await builder.alterCollection('businessUiConnections', (collection) => {
      collection.dropField('clientId');
    });
  },
});

export default migration;
