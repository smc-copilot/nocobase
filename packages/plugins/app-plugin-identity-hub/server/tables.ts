/** Physical collection names. Migrations spell the same names inline and do not import this module. */
export const tables = {
  persons: 'identityHubPersons',
  identities: 'identityHubPersonIdentities',
  providers: 'identityHubProviders',
  organizations: 'identityHubOrganizations',
  departments: 'identityHubDepartments',
  apps: 'identityHubApps',
  memberships: 'identityHubAppMemberships',
  audit: 'identityHubAuditEvents',
  syncRuns: 'identityHubSyncRuns',
  conflicts: 'identityHubConflicts',
} as const;
