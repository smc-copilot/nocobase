import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds the identity administration collections (providers, mapping rules, managed grants, sync
 * runs, Business UI subject pre-bindings and audit events) and sync bookkeeping on
 * `externalIdentities`.
 *
 * `casdoor_identity_202611130001_create_external_identities` is left untouched; this is a new
 * migration. The shape is spelled out here and never imported from a live definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: 'casdoor_identity_202611140001_create_iam_sync_collections',

  async up({ builder }) {
    await builder.alterCollection('externalIdentities', (collection) => {
      // Whether the directory last reported this identity as enabled; null before the first sync.
      collection.boolean('lastSeenEnabled', { nullable: true });
      // Set only when the sync adapter disabled the local user, so it re-enables only its own work.
      collection.datetime('disabledBySyncAt').nullable();
    });

    await builder.createCollection('identityProviders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('issuer', { length: 512 }).notNull();
      collection.string('clientId', { length: 255 }).nullable();
      // A reference to where the client secret lives; the secret itself is never stored here.
      collection.string('secretRef', { length: 255 }).nullable();
      collection.json('claimMapping').notNull();
      collection.json('admissionPolicy').notNull();
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_identity_providers' });
      collection.unique('providerId', {
        name: 'uq_identity_providers_provider_id',
        mode: 'index',
      });
      collection.unique('issuer', {
        name: 'uq_identity_providers_issuer',
        mode: 'index',
      });
    });

    await builder.createCollection('identityMappingRules', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ruleId', { length: 128 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('claim', { length: 128 }).notNull();
      collection.string('claimValue', { length: 255 }).notNull();
      collection.string('permissionSetKey', { length: 255 }).notNull();
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.string('updatedBy', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_identity_mapping_rules' });
      collection.unique('ruleId', {
        name: 'uq_identity_mapping_rules_rule_id',
        mode: 'index',
      });
      collection.index('providerId', {
        name: 'idx_identity_mapping_rules_provider',
      });
    });

    await builder.createCollection(
      'managedPermissionAssignments',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('localUserId', { length: 64 }).notNull();
        collection.string('mappingRuleId', { length: 128 }).notNull();
        collection.string('permissionSetKey', { length: 255 }).notNull();
        // The authorization plugin's assignment row this adapter created; only these may be revoked.
        collection.string('assignmentId', { length: 255 }).notNull();
        collection.string('sourceRevision', { length: 128 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', { name: 'pk_managed_permission_assignments' });
        collection.unique(
          ['localUserId', 'mappingRuleId', 'permissionSetKey'],
          {
            name: 'uq_managed_permission_assignments_user_rule_set',
            mode: 'index',
          },
        );
        collection.index('localUserId', {
          name: 'idx_managed_permission_assignments_user',
        });
        collection.index('mappingRuleId', {
          name: 'idx_managed_permission_assignments_rule',
        });
      },
    );

    await builder.createCollection('identitySyncRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('batchId', { length: 128 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('trigger', { length: 32 }).notNull();
      collection.boolean('dryRun', { nullable: false, defaultValue: false });
      collection.string('result', { length: 32 }).notNull();
      collection.string('cursor', { length: 512 }).nullable();
      collection.json('counts').notNull();
      collection.json('report').nullable();
      collection.string('errorClass', { length: 128 }).nullable();
      collection.text('errorMessage').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('startedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_identity_sync_runs' });
      collection.unique('batchId', {
        name: 'uq_identity_sync_runs_batch_id',
        mode: 'index',
      });
      collection.index('providerId', {
        name: 'idx_identity_sync_runs_provider',
      });
      collection.index('startedAt', { name: 'idx_identity_sync_runs_started' });
    });

    await builder.createCollection(
      'businessUiSubjectBindings',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('connectionId', { length: 128 }).notNull();
        collection.string('octopSubject', { length: 255 }).notNull();
        collection.string('localUserId', { length: 64 }).notNull();
        collection.string('externalIdentityId', { length: 64 }).notNull();
        collection.string('status', { length: 32 }).notNull();
        collection.string('createdBy', { length: 64 }).nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', { name: 'pk_business_ui_subject_bindings' });
        collection.unique(['connectionId', 'octopSubject'], {
          name: 'uq_business_ui_subject_bindings_connection_subject',
          mode: 'index',
        });
        collection.index('localUserId', {
          name: 'idx_business_ui_subject_bindings_user',
        });
        collection.index('externalIdentityId', {
          name: 'idx_business_ui_subject_bindings_external',
        });
      },
    );

    await builder.createCollection('identityAuditEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('action', { length: 64 }).notNull();
      collection.string('actorId', { length: 64 }).nullable();
      collection.string('targetType', { length: 64 }).notNull();
      collection.string('targetId', { length: 255 }).notNull();
      collection.json('details').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_identity_audit_events' });
      collection.index(['targetType', 'targetId'], {
        name: 'idx_identity_audit_events_target',
      });
      collection.index('createdAt', { name: 'idx_identity_audit_events_time' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('identityAuditEvents');
    await builder.dropCollection('businessUiSubjectBindings');
    await builder.dropCollection('identitySyncRuns');
    await builder.dropCollection('managedPermissionAssignments');
    await builder.dropCollection('identityMappingRules');
    await builder.dropCollection('identityProviders');
    await builder.alterCollection('externalIdentities', (collection) => {
      collection.dropField('disabledBySyncAt');
      collection.dropField('lastSeenEnabled');
    });
  },
});

export default migration;
