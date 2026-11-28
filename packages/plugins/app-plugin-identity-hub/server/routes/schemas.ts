import { z } from 'zod';

import {
  CONFLICT_STATUSES,
  MEMBERSHIP_STATUSES,
  PERSON_STATUSES,
  PROVIDER_TYPES,
  RECORD_STATUSES,
} from '../model.js';

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const PageQuerySchema: z.ZodType = z
  .object({
    page,
    pageSize,
  })
  .meta({ ref: 'IdentityHubPageQuery' });

export const PersonListQuerySchema: z.ZodType = z
  .object({
    page,
    pageSize,
    status: z.enum(PERSON_STATUSES).optional(),
  })
  .meta({ ref: 'IdentityHubPersonListQuery' });

export const PersonParamsSchema: z.ZodType = z
  .object({ personId: z.string().min(1) })
  .meta({ ref: 'IdentityHubPersonParams' });

export const ProviderParamsSchema: z.ZodType = z
  .object({ providerId: z.string().min(1) })
  .meta({ ref: 'IdentityHubProviderParams' });

export const AppParamsSchema: z.ZodType = z
  .object({ appId: z.string().min(1) })
  .meta({ ref: 'IdentityHubAppParams' });

export const MembershipParamsSchema: z.ZodType = z
  .object({
    appId: z.string().min(1),
    personId: z.string().min(1),
  })
  .meta({ ref: 'IdentityHubMembershipParams' });

export const ConflictParamsSchema: z.ZodType = z
  .object({ conflictId: z.string().min(1) })
  .meta({ ref: 'IdentityHubConflictParams' });

export const ConflictListQuerySchema: z.ZodType = z
  .object({
    page,
    pageSize,
    status: z.enum(CONFLICT_STATUSES).optional(),
  })
  .meta({ ref: 'IdentityHubConflictListQuery' });

const jsonObject = z.record(z.string(), z.unknown()).nullable();

const manualIdentity = z
  .object({
    providerId: z.string().min(1),
    subject: z.string().min(1),
    externalId: z.string().nullable().optional(),
    externalUsername: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
  })
  .meta({ ref: 'IdentityHubManualIdentityInput' });

export const CreatePersonSchema: z.ZodType = z
  .object({
    displayName: z.string().min(1),
    employeeNo: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    organizationId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    status: z.enum(PERSON_STATUSES).optional(),
    sourceAuthority: jsonObject.optional(),
    manualIdentity: manualIdentity.optional(),
  })
  .meta({ ref: 'IdentityHubCreatePerson' });

export const UpdatePersonSchema: z.ZodType = z
  .object({
    displayName: z.string().min(1).optional(),
    employeeNo: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    organizationId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    sourceAuthority: jsonObject.optional(),
  })
  .meta({ ref: 'IdentityHubUpdatePerson' });

export const PersonSchema: z.ZodType = z
  .object({
    personId: z.string(),
    employeeNo: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string(),
    email: z.string().nullable(),
    mobile: z.string().nullable(),
    organizationId: z.string().nullable(),
    departmentId: z.string().nullable(),
    status: z.enum(PERSON_STATUSES),
    version: z.number().int(),
    sourceAuthority: jsonObject,
    disabledAt: z.iso.datetime().nullable(),
    manualIdentityId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubPerson' });

export const ProviderBodySchema: z.ZodType = z
  .object({
    providerId: z.string().min(1),
    providerType: z.enum(PROVIDER_TYPES),
    displayName: z.string().min(1),
    enabled: z.boolean().optional(),
    capabilities: jsonObject.optional(),
    issuer: z.string().nullable().optional(),
    discoveryUrl: z.string().nullable().optional(),
    endpoints: jsonObject.optional(),
    secretRef: z.string().nullable().optional(),
    claimMapping: jsonObject.optional(),
    admissionPolicy: jsonObject.optional(),
    syncPolicy: jsonObject.optional(),
    attributeAuthority: jsonObject.optional(),
  })
  .meta({ ref: 'IdentityHubProviderBody' });

export const ProviderPatchSchema: z.ZodType = z
  .object({
    providerType: z.enum(PROVIDER_TYPES).optional(),
    displayName: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    capabilities: jsonObject.optional(),
    issuer: z.string().nullable().optional(),
    discoveryUrl: z.string().nullable().optional(),
    endpoints: jsonObject.optional(),
    secretRef: z.string().nullable().optional(),
    claimMapping: jsonObject.optional(),
    admissionPolicy: jsonObject.optional(),
    syncPolicy: jsonObject.optional(),
    attributeAuthority: jsonObject.optional(),
  })
  .meta({ ref: 'IdentityHubProviderPatch' });

export const ProviderSchema: z.ZodType = z
  .object({
    providerId: z.string(),
    providerType: z.enum(PROVIDER_TYPES),
    displayName: z.string(),
    enabled: z.boolean(),
    capabilities: jsonObject,
    issuer: z.string().nullable(),
    discoveryUrl: z.string().nullable(),
    endpoints: jsonObject,
    secretConfigured: z.boolean(),
    claimMapping: jsonObject,
    admissionPolicy: jsonObject,
    syncPolicy: jsonObject,
    attributeAuthority: jsonObject,
    lastHealthCheckAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubProvider' });

export const LinkPreviewSchema: z.ZodType = z
  .object({
    providerId: z.string().min(1),
    subject: z.string().min(1),
    issuer: z.string().nullable().optional(),
    externalId: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .meta({ ref: 'IdentityHubLinkPreviewInput' });

export const LinkSchema: z.ZodType = z
  .object({
    personId: z.string().min(1),
    providerId: z.string().min(1),
    subject: z.string().min(1),
    issuer: z.string().nullable().optional(),
    externalId: z.string().nullable().optional(),
    externalUsername: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .meta({ ref: 'IdentityHubLinkInput' });

export const UnlinkSchema: z.ZodType = z
  .object({
    providerId: z.string().min(1),
    identityId: z.string().min(1),
  })
  .meta({ ref: 'IdentityHubUnlinkInput' });

export const IdentitySchema: z.ZodType = z
  .object({
    identityId: z.string(),
    personId: z.string(),
    providerId: z.string(),
    providerType: z.string(),
    issuer: z.string().nullable(),
    subject: z.string(),
    externalId: z.string().nullable(),
    externalUsername: z.string().nullable(),
    identityKey: z.string(),
    status: z.enum(['active', 'disabled', 'pending', 'unlinked']),
    verifiedAt: z.iso.datetime().nullable(),
    lastAuthenticatedAt: z.iso.datetime().nullable(),
    lastSyncedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubPersonIdentity' });

export const LinkPreviewResultSchema: z.ZodType = z
  .object({
    identityKey: z.string(),
    existingIdentity: IdentitySchema.nullable(),
    suggestedPersonId: z.string().nullable(),
    emailMatchIgnored: z.boolean(),
  })
  .meta({ ref: 'IdentityHubLinkPreview' });

export const AppBodySchema: z.ZodType = z
  .object({
    appId: z.string().min(1),
    displayName: z.string().min(1),
    environment: z.string().optional(),
    oidcClientId: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
    redirectUris: z.array(z.string()).nullable().optional(),
    postLogoutRedirectUris: z.array(z.string()).nullable().optional(),
    status: z.enum(RECORD_STATUSES).optional(),
    owner: z.string().nullable().optional(),
    metadata: jsonObject.optional(),
  })
  .meta({ ref: 'IdentityHubAppBody' });

export const AppPatchSchema: z.ZodType = z
  .object({
    displayName: z.string().min(1).optional(),
    environment: z.string().optional(),
    oidcClientId: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
    redirectUris: z.array(z.string()).nullable().optional(),
    postLogoutRedirectUris: z.array(z.string()).nullable().optional(),
    status: z.enum(RECORD_STATUSES).optional(),
    owner: z.string().nullable().optional(),
    metadata: jsonObject.optional(),
  })
  .meta({ ref: 'IdentityHubAppPatch' });

export const AppSchema: z.ZodType = z
  .object({
    appId: z.string(),
    displayName: z.string(),
    environment: z.string(),
    oidcClientId: z.string().nullable(),
    issuer: z.string().nullable(),
    redirectUris: z.array(z.string()),
    postLogoutRedirectUris: z.array(z.string()),
    status: z.enum(RECORD_STATUSES),
    owner: z.string().nullable(),
    metadata: jsonObject,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubApp' });

export const GrantMembershipSchema: z.ZodType = z
  .object({
    personId: z.string().min(1),
    status: z.enum(['invited', 'active']).optional(),
    source: z.string().optional(),
    validFrom: z.iso.datetime().nullable().optional(),
    validTo: z.iso.datetime().nullable().optional(),
    reason: z.string().nullable().optional(),
  })
  .meta({ ref: 'IdentityHubGrantMembership' });

export const MembershipSchema: z.ZodType = z
  .object({
    membershipId: z.string(),
    personId: z.string(),
    appId: z.string(),
    status: z.enum(MEMBERSHIP_STATUSES),
    source: z.string(),
    validFrom: z.iso.datetime().nullable(),
    validTo: z.iso.datetime().nullable(),
    revision: z.number().int(),
    reason: z.string().nullable(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubMembership' });

export const AuditEventSchema: z.ZodType = z
  .object({
    eventId: z.string(),
    actorId: z.string().nullable(),
    personId: z.string().nullable(),
    providerId: z.string().nullable(),
    appId: z.string().nullable(),
    action: z.string(),
    result: z.string(),
    reason: z.string().nullable(),
    requestId: z.string().nullable(),
    details: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime(),
  })
  .meta({ ref: 'IdentityHubAuditEvent' });

export const ConflictSchema: z.ZodType = z
  .object({
    conflictId: z.string(),
    conflictType: z.string(),
    status: z.enum(CONFLICT_STATUSES),
    payload: z.record(z.string(), z.unknown()),
    personId: z.string().nullable(),
    providerId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .meta({ ref: 'IdentityHubConflict' });

export const ResolveConflictSchema: z.ZodType = z
  .object({ status: z.enum(['resolved', 'rejected']) })
  .meta({ ref: 'IdentityHubResolveConflict' });

export const ProviderHealthSchema: z.ZodType = z
  .object({
    ok: z.boolean(),
    checkedAt: z.iso.datetime(),
    detail: z.string().nullable(),
  })
  .meta({ ref: 'IdentityHubProviderHealth' });

const syncAction = z.enum(['create', 'link', 'update', 'conflict', 'skip']);

export const SyncProposalSchema: z.ZodType = z
  .object({
    externalId: z.string(),
    identityKey: z.string(),
    externalUsername: z.string().nullable(),
    displayName: z.string().nullable(),
    action: syncAction,
    personId: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .meta({ ref: 'IdentityHubSyncProposal' });

export const SyncPreviewSchema: z.ZodType = z
  .object({
    providerId: z.string(),
    proposals: z.array(SyncProposalSchema),
  })
  .meta({ ref: 'IdentityHubSyncPreview' });

export const SyncFailureSchema: z.ZodType = z
  .object({
    externalId: z.string().nullable(),
    reason: z.string(),
  })
  .meta({ ref: 'IdentityHubSyncFailure' });

export const SyncStatsSchema: z.ZodType = z
  .object({
    created: z.number().int(),
    linked: z.number().int(),
    updated: z.number().int(),
    conflicts: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
    failures: z.array(SyncFailureSchema),
  })
  .meta({ ref: 'IdentityHubSyncStats' });

export const SyncRunSchema: z.ZodType = z
  .object({
    batchId: z.string(),
    providerId: z.string(),
    status: z.enum(['running', 'succeeded', 'failed']),
    stats: SyncStatsSchema,
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    error: z.string().nullable(),
  })
  .meta({ ref: 'IdentityHubSyncRun' });

export const PageMetaSchema: z.ZodType = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ ref: 'IdentityHubPageMeta' });
