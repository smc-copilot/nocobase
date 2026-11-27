import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One-time Route Ticket ledger for Octop Router entry. Stores only the
 * SHA-256 of jti — never the compact JWS itself.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'enterprise_app_portal_202611231200_route_tickets',

  async up({ builder }) {
    await builder.createCollection(
      'enterprisePortalRouteTickets',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('jtiHash', { length: 64 }).notNull();
        collection.string('localUserId', { length: 64 }).notNull();
        collection.string('casdoorSubject', { length: 255 }).notNull();
        collection.string('appCode', { length: 64 }).notNull();
        collection.string('requestId', { length: 64 }).notNull();
        collection.datetime('issuedAt').notNull();
        collection.datetime('expiresAt').notNull();
        collection.datetime('consumedAt').nullable();
        collection.string('redeemResult', { length: 64 }).nullable();
        collection.datetime('createdAt').notNull();

        collection.primary('id', {
          name: 'pk_enterprise_portal_route_tickets',
        });
        collection.unique('jtiHash', {
          name: 'uq_enterprise_portal_route_ticket_jti',
          mode: 'index',
        });
        collection.index('localUserId', {
          name: 'idx_enterprise_portal_route_ticket_user',
        });
        collection.index('expiresAt', {
          name: 'idx_enterprise_portal_route_ticket_exp',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('enterprisePortalRouteTickets');
  },
});

export default migration;
