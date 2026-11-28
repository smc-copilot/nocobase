import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the Identity Hub core collections. Every name is spelled out here.
 * This file does not import live collection definitions.
 *
 * `employeeNo` is unique across persons for this MVP. A partial unique index on
 * `(organizationId, employeeNo) WHERE employeeNo IS NOT NULL` is not portable:
 * MySQL has no partial indexes, and a NULL `organizationId` does not collide in
 * a composite unique index. NULL employee numbers stay unrestricted because SQL
 * unique indexes treat NULL as distinct.
 *
 * Application uniqueness is `appId` for this MVP. A later migration can add
 * `(appId, environment)` when one app id must exist in more than one environment.
 *
 * `identityHubAuditEvents.details` stores the redacted change payload. Secret-like
 * keys are removed before insert; the column never holds a provider secret value.
 * Provider rows store `secretRef` only.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'identity_hub_202611280001_create_core',

  async up({ builder }) {
    await builder.createCollection('identityHubPersons', (collection) => {
      collection.string('personId', { length: 64 }).primary().notNull();
      collection.string('employeeNo', { length: 64 }).nullable();
      collection.string('username', { length: 128 }).nullable();
      collection.string('displayName', { length: 255 }).notNull();
      collection.string('email', { length: 320 }).nullable();
      collection.string('mobile', { length: 32 }).nullable();
      collection.string('organizationId', { length: 64 }).nullable();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('version').notNull().defaultTo(1);
      collection.json('sourceAuthority').nullable();
      collection.datetime('disabledAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('employeeNo', {
        name: 'uq_identity_hub_persons_employee_no',
        mode: 'index',
      });
      collection.index('status', { name: 'idx_identity_hub_persons_status' });
      collection.index('organizationId', {
        name: 'idx_identity_hub_persons_organization',
      });
    });

    await builder.createCollection(
      'identityHubPersonIdentities',
      (collection) => {
        collection.string('identityId', { length: 64 }).primary().notNull();
        collection.string('personId', { length: 64 }).notNull();
        collection.string('providerId', { length: 128 }).notNull();
        collection.string('providerType', { length: 32 }).notNull();
        collection.string('issuer', { length: 512 }).nullable();
        collection.string('subject', { length: 255 }).notNull();
        collection.string('externalId', { length: 255 }).nullable();
        collection.string('externalUsername', { length: 255 }).nullable();
        collection.string('identityKey', { length: 255 }).notNull();
        collection.string('status', { length: 32 }).notNull();
        collection.datetime('verifiedAt').nullable();
        collection.datetime('lastAuthenticatedAt').nullable();
        collection.datetime('lastSyncedAt').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.unique(['providerId', 'identityKey'], {
          name: 'uq_identity_hub_identities_provider_key',
          mode: 'index',
        });
        collection.index('personId', {
          name: 'idx_identity_hub_identities_person',
        });
      },
    );

    await builder.createCollection('identityHubProviders', (collection) => {
      collection.string('providerId', { length: 128 }).primary().notNull();
      collection.string('providerType', { length: 32 }).notNull();
      collection.string('displayName', { length: 255 }).notNull();
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.json('capabilities').nullable();
      collection.string('issuer', { length: 512 }).nullable();
      collection.string('discoveryUrl', { length: 512 }).nullable();
      collection.json('endpoints').nullable();
      collection.string('secretRef', { length: 255 }).nullable();
      collection.json('claimMapping').nullable();
      collection.json('admissionPolicy').nullable();
      collection.json('syncPolicy').nullable();
      collection.json('attributeAuthority').nullable();
      collection.datetime('lastHealthCheckAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('providerType', {
        name: 'idx_identity_hub_providers_type',
      });
    });

    await builder.createCollection('identityHubOrganizations', (collection) => {
      collection.string('organizationId', { length: 64 }).primary().notNull();
      collection.string('displayName', { length: 255 }).notNull();
      collection.string('parentId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('parentId', {
        name: 'idx_identity_hub_organizations_parent',
      });
    });

    await builder.createCollection('identityHubDepartments', (collection) => {
      collection.string('departmentId', { length: 64 }).primary().notNull();
      collection.string('organizationId', { length: 64 }).notNull();
      collection.string('displayName', { length: 255 }).notNull();
      collection.string('parentId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('organizationId', {
        name: 'idx_identity_hub_departments_organization',
      });
    });

    await builder.createCollection('identityHubApps', (collection) => {
      collection.string('appId', { length: 128 }).primary().notNull();
      collection.string('displayName', { length: 255 }).notNull();
      collection.string('environment', { length: 64 }).notNull();
      collection.string('oidcClientId', { length: 255 }).nullable();
      collection.string('issuer', { length: 512 }).nullable();
      collection.json('redirectUris').nullable();
      collection.json('postLogoutRedirectUris').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.string('owner', { length: 255 }).nullable();
      collection.json('metadata').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection(
      'identityHubAppMemberships',
      (collection) => {
        collection.string('membershipId', { length: 64 }).primary().notNull();
        collection.string('personId', { length: 64 }).notNull();
        collection.string('appId', { length: 128 }).notNull();
        collection.string('status', { length: 32 }).notNull();
        collection.string('source', { length: 64 }).notNull();
        collection.datetime('validFrom').nullable();
        collection.datetime('validTo').nullable();
        collection.integer('revision').notNull().defaultTo(1);
        collection.string('reason', { length: 512 }).nullable();
        collection.string('createdBy', { length: 64 }).nullable();
        collection.string('updatedBy', { length: 64 }).nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.unique(['personId', 'appId'], {
          name: 'uq_identity_hub_memberships_person_app',
          mode: 'index',
        });
        collection.index('appId', {
          name: 'idx_identity_hub_memberships_app',
        });
      },
    );

    await builder.createCollection('identityHubAuditEvents', (collection) => {
      collection.string('eventId', { length: 64 }).primary().notNull();
      collection.string('actorId', { length: 64 }).nullable();
      collection.string('personId', { length: 64 }).nullable();
      collection.string('providerId', { length: 128 }).nullable();
      collection.string('appId', { length: 128 }).nullable();
      collection.string('action', { length: 64 }).notNull();
      collection.string('result', { length: 32 }).notNull();
      collection.string('reason', { length: 512 }).nullable();
      collection.string('requestId', { length: 64 }).nullable();
      collection.json('details').notNull();
      collection.datetime('createdAt').notNull();
      collection.index('createdAt', {
        name: 'idx_identity_hub_audit_created',
      });
      collection.index('personId', { name: 'idx_identity_hub_audit_person' });
    });

    await builder.createCollection('identityHubSyncRuns', (collection) => {
      collection.string('batchId', { length: 64 }).primary().notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.json('stats').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('finishedAt').nullable();
      collection.text('error').nullable();
      collection.index('providerId', {
        name: 'idx_identity_hub_sync_runs_provider',
      });
    });

    await builder.createCollection('identityHubConflicts', (collection) => {
      collection.string('conflictId', { length: 64 }).primary().notNull();
      collection.string('conflictType', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.json('payload').notNull();
      collection.string('personId', { length: 64 }).nullable();
      collection.string('providerId', { length: 128 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('resolvedAt').nullable();
      collection.index('status', { name: 'idx_identity_hub_conflicts_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('identityHubConflicts');
    await builder.dropCollection('identityHubSyncRuns');
    await builder.dropCollection('identityHubAuditEvents');
    await builder.dropCollection('identityHubAppMemberships');
    await builder.dropCollection('identityHubApps');
    await builder.dropCollection('identityHubDepartments');
    await builder.dropCollection('identityHubOrganizations');
    await builder.dropCollection('identityHubProviders');
    await builder.dropCollection('identityHubPersonIdentities');
    await builder.dropCollection('identityHubPersons');
  },
});

export default migration;
