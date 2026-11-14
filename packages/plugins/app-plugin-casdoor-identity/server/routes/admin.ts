import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  describeRoute,
  listResponse,
  ApiError,
} from '@nocobase/app-server/router';
import { z } from 'zod';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  ERROR_DOMAIN,
  SETTINGS_MAPPING,
  SETTINGS_SUBJECT_BINDINGS,
  SETTINGS_SYNC,
} from '../config.js';
import { toProviderView } from '../services/identity-providers.js';
import { isAdmissionConfigured } from '../identity/admission.js';
import type { IdentityServices } from '../identity/services.js';

const Identifier = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    'Use letters, digits, `.`, `_`, `:` or `-`.',
  )
  .max(128);

const StringList = z.array(z.string().min(1).max(255)).max(500);

const AdmissionPolicySchema = z
  .strictObject({
    allowOrganizations: StringList.optional(),
    allowGroups: StringList.optional(),
    allowEmails: StringList.optional(),
    allowEmailDomains: StringList.optional(),
    allowSubjects: StringList.optional(),
    denyOrganizations: StringList.optional(),
    denyGroups: StringList.optional(),
    denySubjects: StringList.optional(),
  })
  .meta({
    ref: 'CasdoorIdentityAdmissionPolicy',
    description:
      'Deny lists win; otherwise a user must match an allow list. A policy with no allow entries admits nobody.',
  });

const ClaimMappingSchema = z
  .strictObject({
    email: z.string().max(255).optional(),
    emailVerified: z.string().max(255).optional(),
    name: z.string().max(255).optional(),
    organization: z.string().max(255).optional(),
    groups: z.string().max(255).optional(),
  })
  .meta({ ref: 'CasdoorIdentityClaimMapping' });

const ProviderParams = z.object({ providerId: Identifier });

const UpsertProviderInput = z.strictObject({
  issuer: z.string().url().max(512),
  clientId: z.string().max(255).nullable().optional(),
  secretRef: z
    .string()
    .max(255)
    .nullable()
    .optional()
    .describe(
      'Write-only pointer to the client secret; reads only report whether one is set.',
    ),
  claimMapping: ClaimMappingSchema.optional(),
  admissionPolicy: AdmissionPolicySchema.optional(),
  enabled: z.boolean().optional(),
});

const ProviderSchema = z.object({
  providerId: z.string(),
  issuer: z.string(),
  clientId: z.string().nullable(),
  secretConfigured: z.boolean(),
  claimMapping: z.record(z.string(), z.string().optional()),
  admissionPolicy: z.record(z.string(), z.array(z.string()).optional()),
  admissionConfigured: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});

const RuleParams = z.object({ ruleId: Identifier });

const MappingRuleQuery = z.object({ providerId: Identifier.optional() });

const CreateMappingRuleInput = z.strictObject({
  ruleId: Identifier,
  providerId: Identifier,
  claim: z.string().min(1).max(128),
  claimValue: z.string().min(1).max(255),
  permissionSetKey: z.string().min(1).max(255),
  enabled: z.boolean().optional(),
});

const UpdateMappingRuleInput = z.strictObject({
  claim: z.string().min(1).max(128).optional(),
  claimValue: z.string().min(1).max(255).optional(),
  permissionSetKey: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
});

const MappingRuleSchema = z
  .object({
    ruleId: z.string(),
    providerId: z.string(),
    claim: z.string(),
    claimValue: z.string(),
    permissionSetKey: z.string(),
    enabled: z.boolean(),
    updatedBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'CasdoorIdentityMappingRule' });

const SyncRunQuery = z.object({
  providerId: Identifier.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SyncRunParams = z.object({ batchId: Identifier });

const RunSyncInput = z.strictObject({
  providerId: Identifier.optional(),
  batchId: Identifier.refine((value) => value !== 'preview', {
    message: '`preview` is a reserved segment.',
  }).optional(),
  cursor: z.string().max(512).optional(),
});

const PreviewSyncInput = z.strictObject({ providerId: Identifier.optional() });

const SyncCountsSchema = z.object({
  examined: z.number(),
  unbound: z.number(),
  disabled: z.number(),
  enabled: z.number(),
  grantsAdded: z.number(),
  grantsRevoked: z.number(),
  unchanged: z.number(),
  failed: z.number(),
});

const SyncRunSchema = z
  .object({
    batchId: z.string(),
    providerId: z.string(),
    trigger: z.string(),
    dryRun: z.boolean(),
    result: z.string(),
    cursor: z.string().nullable(),
    counts: SyncCountsSchema,
    report: z.array(
      z.object({
        subject: z.string(),
        localUserId: z.string().optional(),
        actions: z.array(z.string()),
        error: z.string().optional(),
      }),
    ),
    errorClass: z.string().nullable(),
    errorMessage: z.string().nullable(),
    actorId: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  })
  .meta({ ref: 'CasdoorIdentitySyncRun' });

const SyncStatusSchema = z.object({
  schedulerMode: z.enum(['scheduler', 'timer', 'none']),
  directoryConfigured: z.boolean(),
  providers: z.array(
    z.object({
      providerId: z.string(),
      enabled: z.boolean(),
      lastRun: SyncRunSchema.nullable(),
      lastSuccessAt: z.string().nullable(),
    }),
  ),
});

const SubjectBindingQuery = z.object({
  connectionId: Identifier.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const SubjectBindingRowSchema = z.strictObject({
  connectionId: Identifier,
  octopSubject: z.string().min(1).max(255),
  externalIdentityId: z.string().max(64).optional(),
  issuer: z.string().max(512).optional(),
  subject: z.string().max(255).optional(),
  localUserId: z.string().max(64).optional(),
});

const SubjectBindingBatchInput = z.strictObject({
  rows: z.array(SubjectBindingRowSchema).min(1).max(500),
});

const SubjectBindingSchema = z
  .object({
    id: z.string(),
    connectionId: z.string(),
    octopSubject: z.string(),
    localUserId: z.string(),
    externalIdentityId: z.string(),
    status: z.string(),
    revision: z.number().int(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'CasdoorIdentitySubjectBinding' });

const SubjectBindingPreviewSchema = z
  .object({
    rows: z.array(
      z.object({
        index: z.number(),
        connectionId: z.string(),
        octopSubject: z.string(),
        status: z.enum(['create', 'unchanged', 'conflict']),
        conflicts: z.array(z.string()),
        localUserId: z.string().optional(),
        externalIdentityId: z.string().optional(),
      }),
    ),
    summary: z.object({
      create: z.number(),
      unchanged: z.number(),
      conflict: z.number(),
    }),
  })
  .meta({ ref: 'CasdoorIdentitySubjectBindingPreview' });

const tags = ['CasdoorIdentity'];

type AdminEnv = { Variables: AuthEnv['Variables'] };

export interface AdminRouterOptions {
  readonly services: () => IdentityServices;
  /** Authentication middleware for the admin paths (a signed-in session; no scoped credentials). */
  readonly authenticate: MiddlewareHandler[];
  /** Whether the caller holds `action` on the settings item `item`. */
  readonly authorize: (
    context: Context,
    item: string,
    action: string,
  ) => Promise<boolean>;
}

/** The URL prefixes this router owns; the host mounts middleware on exactly these. */
export const ADMIN_PATHS: readonly string[] = [
  '/syncStatus',
  '/syncRuns',
  '/providers',
  '/mappingRules',
  '/subjectBindings',
];

const forbidden = (item: string, action: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'IDENTITY_ADMIN_FORBIDDEN',
    domain: ERROR_DOMAIN,
    message: `The ${action} action on ${item} is required.`,
  });

/**
 * Identity administration routes: sync status and runs, providers, mapping rules, and subject
 * pre-binding import. Each path checks an `authz.settings` item before it looks anything up.
 */
export function createAdminRouter(options: AdminRouterOptions): Hono<AdminEnv> {
  const router = new Hono<AdminEnv>();
  router.onError((error, context) => apiErrorHandler(error, context));
  for (const path of ADMIN_PATHS) {
    for (const middleware of options.authenticate) {
      router.use(path, middleware);
      router.use(`${path}/*`, middleware);
    }
  }
  const permit =
    (item: string, action: string): MiddlewareHandler =>
    async (context, next) => {
      if (!(await options.authorize(context, item, action))) {
        throw forbidden(item, action);
      }
      await next();
    };
  const actorOf = (context: Context<AdminEnv>): string | null =>
    context.get('auth')?.user.id ?? null;
  const services = options.services;

  // ----- Sync ------------------------------------------------------------------------------

  router.get(
    '/syncStatus',
    permit(SETTINGS_SYNC, 'read'),
    describeRoute({
      tags,
      summary: 'Get identity sync status',
      operationId: 'casdoorIdentityGetSyncStatus',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SYNC}\` read. Reports each provider's latest real run and how periodic sync is driven.`,
      responses: { 200: dataResponse(SyncStatusSchema), ...apiErrorResponses },
    }),
    async (context) => context.json({ data: await services().sync.status() }),
  );

  router.get(
    '/syncRuns',
    permit(SETTINGS_SYNC, 'read'),
    describeRoute({
      tags,
      summary: 'List identity sync runs',
      operationId: 'casdoorIdentityListSyncRuns',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SYNC}\` read. Newest first.`,
      responses: { 200: listResponse(SyncRunSchema), ...apiErrorResponses },
    }),
    apiValidator('query', SyncRunQuery),
    async (context) => {
      const query = context.req.valid('query');
      const runs = await services().sync.listRuns({
        limit: query.limit,
        ...(query.providerId ? { providerId: query.providerId } : {}),
      });
      return context.json({ data: runs, meta: { total: runs.length } });
    },
  );

  router.post(
    '/syncRuns/preview',
    permit(SETTINGS_SYNC, 'run'),
    describeRoute({
      tags,
      summary: 'Preview an identity reconciliation',
      operationId: 'casdoorIdentityPreviewSyncRun',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SYNC}\` run. Read-only: reports the differences a run would apply and records the preview as a run.`,
      responses: {
        200: dataResponse(SyncRunSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'No directory is configured (`DIRECTORY_NOT_CONFIGURED`) or the provider is ambiguous.',
        ),
        409: apiErrorResponse(
          409,
          'A sync is already running (`SYNC_ALREADY_RUNNING`).',
        ),
      },
    }),
    apiValidator('json', PreviewSyncInput),
    async (context) => {
      const input = context.req.valid('json');
      const run = await services().sync.run({
        trigger: 'preview',
        dryRun: true,
        actorId: actorOf(context),
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
      return context.json({ data: run });
    },
  );

  router.post(
    '/syncRuns',
    permit(SETTINGS_SYNC, 'run'),
    describeRoute({
      tags,
      summary: 'Run an identity reconciliation batch',
      operationId: 'casdoorIdentityCreateSyncRun',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SYNC}\` run. Runs one batch now and answers with its report; a rerun uses a new \`batchId\`, and \`cursor\` resumes a failed batch.`,
      responses: {
        201: dataResponse(SyncRunSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'No directory is configured (`DIRECTORY_NOT_CONFIGURED`) or the provider is ambiguous.',
        ),
        409: apiErrorResponse(
          409,
          'The batch id exists (`SYNC_BATCH_EXISTS`) or a sync is already running (`SYNC_ALREADY_RUNNING`).',
        ),
      },
    }),
    apiValidator('json', RunSyncInput),
    async (context) => {
      const input = context.req.valid('json');
      const run = await services().sync.run({
        trigger: 'manual',
        actorId: actorOf(context),
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.batchId ? { batchId: input.batchId } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      });
      return context.json({ data: run }, 201);
    },
  );

  router.get(
    '/syncRuns/:batchId',
    permit(SETTINGS_SYNC, 'read'),
    describeRoute({
      tags,
      summary: 'Get an identity sync run',
      operationId: 'casdoorIdentityGetSyncRun',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SYNC}\` read.`,
      responses: {
        200: dataResponse(SyncRunSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such batch (`SYNC_RUN_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', SyncRunParams),
    async (context) => {
      const { batchId } = context.req.valid('param');
      const run = await services().sync.getRun(batchId);
      if (!run) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SYNC_RUN_NOT_FOUND',
          domain: ERROR_DOMAIN,
          message: `Sync batch ${batchId} was not found.`,
        });
      }
      return context.json({ data: run });
    },
  );

  // ----- Providers -------------------------------------------------------------------------

  router.get(
    '/providers',
    permit(SETTINGS_MAPPING, 'read'),
    describeRoute({
      tags,
      summary: 'List identity providers',
      operationId: 'casdoorIdentityListProviders',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` read. The secret reference is never returned; \`secretConfigured\` only says whether one is set.`,
      responses: { 200: listResponse(ProviderSchema), ...apiErrorResponses },
    }),
    async (context) => {
      const providers = await services().providers.list();
      return context.json({
        data: providers.map((provider) =>
          toProviderView(
            provider,
            isAdmissionConfigured(provider.admissionPolicy),
          ),
        ),
        meta: { total: providers.length },
      });
    },
  );

  router.put(
    '/providers/:providerId',
    permit(SETTINGS_MAPPING, 'configure'),
    describeRoute({
      tags,
      summary: 'Create or replace an identity provider',
      operationId: 'casdoorIdentityPutProvider',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` configure. \`secretRef\` is write-only: omit it to keep the stored value. A provider without admission allow entries admits nobody.`,
      responses: {
        200: dataResponse(ProviderSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(
          409,
          'Another provider uses this issuer (`IDENTITY_PROVIDER_ISSUER_CONFLICT`).',
        ),
      },
    }),
    apiValidator('param', ProviderParams),
    apiValidator('json', UpsertProviderInput),
    async (context) => {
      const { providerId } = context.req.valid('param');
      const input = context.req.valid('json');
      const provider = await services().providers.upsert(
        {
          providerId,
          issuer: input.issuer,
          ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
          ...(input.secretRef !== undefined
            ? { secretRef: input.secretRef }
            : {}),
          ...(input.claimMapping ? { claimMapping: input.claimMapping } : {}),
          ...(input.admissionPolicy
            ? { admissionPolicy: input.admissionPolicy }
            : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        },
        actorOf(context),
      );
      return context.json({
        data: toProviderView(
          provider,
          isAdmissionConfigured(provider.admissionPolicy),
        ),
      });
    },
  );

  // ----- Mapping rules ---------------------------------------------------------------------

  router.get(
    '/mappingRules',
    permit(SETTINGS_MAPPING, 'read'),
    describeRoute({
      tags,
      summary: 'List Permission Set mapping rules',
      operationId: 'casdoorIdentityListMappingRules',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` read.`,
      responses: { 200: listResponse(MappingRuleSchema), ...apiErrorResponses },
    }),
    apiValidator('query', MappingRuleQuery),
    async (context) => {
      const { providerId } = context.req.valid('query');
      const rules = await services().mapping.listRules(providerId);
      return context.json({ data: rules, meta: { total: rules.length } });
    },
  );

  router.post(
    '/mappingRules',
    permit(SETTINGS_MAPPING, 'configure'),
    describeRoute({
      tags,
      summary: 'Create a Permission Set mapping rule',
      operationId: 'casdoorIdentityCreateMappingRule',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` configure. The Permission Set must be on \`casdoorIdentity.mappablePermissionSets\` and may never be unrestricted (\`root\`).`,
      responses: {
        201: dataResponse(MappingRuleSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The set is not mappable, or the provider does not exist.',
        ),
        409: apiErrorResponse(
          409,
          'The rule id exists (`MAPPING_RULE_EXISTS`).',
        ),
      },
    }),
    apiValidator('json', CreateMappingRuleInput),
    async (context) => {
      const rule = await services().mapping.createRule(
        context.req.valid('json'),
        actorOf(context),
      );
      return context.json({ data: rule }, 201);
    },
  );

  router.patch(
    '/mappingRules/:ruleId',
    permit(SETTINGS_MAPPING, 'configure'),
    describeRoute({
      tags,
      summary: 'Update a Permission Set mapping rule',
      operationId: 'casdoorIdentityUpdateMappingRule',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` configure. Changes apply at the next login or sync.`,
      responses: {
        200: dataResponse(MappingRuleSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(400, 'The set is not mappable.'),
        404: apiErrorResponse(404, 'No such rule (`MAPPING_RULE_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', RuleParams),
    apiValidator('json', UpdateMappingRuleInput),
    async (context) => {
      const { ruleId } = context.req.valid('param');
      const patch = context.req.valid('json');
      const rule = await services().mapping.updateRule(
        ruleId,
        {
          ...(patch.claim !== undefined ? { claim: patch.claim } : {}),
          ...(patch.claimValue !== undefined
            ? { claimValue: patch.claimValue }
            : {}),
          ...(patch.permissionSetKey !== undefined
            ? { permissionSetKey: patch.permissionSetKey }
            : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        },
        actorOf(context),
      );
      return context.json({ data: rule });
    },
  );

  router.delete(
    '/mappingRules/:ruleId',
    permit(SETTINGS_MAPPING, 'configure'),
    describeRoute({
      tags,
      summary: 'Delete a Permission Set mapping rule',
      operationId: 'casdoorIdentityDeleteMappingRule',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_MAPPING}\` configure. Also withdraws the grants this rule made; grants assigned by hand are untouched.`,
      responses: {
        204: { description: 'The rule was deleted.' },
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such rule (`MAPPING_RULE_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', RuleParams),
    async (context) => {
      await services().mapping.deleteRule(
        context.req.valid('param').ruleId,
        actorOf(context),
      );
      return context.body(null, 204);
    },
  );

  // ----- Subject pre-binding ---------------------------------------------------------------

  router.get(
    '/subjectBindings',
    permit(SETTINGS_SUBJECT_BINDINGS, 'read'),
    describeRoute({
      tags,
      summary: 'List Business UI subject bindings',
      operationId: 'casdoorIdentityListSubjectBindings',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SUBJECT_BINDINGS}\` read.`,
      responses: {
        200: listResponse(SubjectBindingSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', SubjectBindingQuery),
    async (context) => {
      const query = context.req.valid('query');
      const bindings = await services().bindings.list({
        limit: query.limit,
        ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      });
      return context.json({ data: bindings, meta: { total: bindings.length } });
    },
  );

  router.post(
    '/subjectBindings/preview',
    permit(SETTINGS_SUBJECT_BINDINGS, 'import'),
    describeRoute({
      tags,
      summary: 'Preview a subject binding import',
      operationId: 'casdoorIdentityPreviewSubjectBindings',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SUBJECT_BINDINGS}\` import. Read-only: classifies each row as create, unchanged or conflict.`,
      responses: {
        200: dataResponse(SubjectBindingPreviewSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', SubjectBindingBatchInput),
    async (context) =>
      context.json({
        data: await services().bindings.preview(context.req.valid('json').rows),
      }),
  );

  router.post(
    '/subjectBindings/commit',
    permit(SETTINGS_SUBJECT_BINDINGS, 'import'),
    describeRoute({
      tags,
      summary: 'Commit a subject binding import',
      operationId: 'casdoorIdentityCommitSubjectBindings',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SUBJECT_BINDINGS}\` import. Atomic and audited: any conflict (\`SUBJECT_BINDING_CONFLICTS\`, with the per-row report in \`metadata.report\`) writes nothing.`,
      responses: {
        200: dataResponse(SubjectBindingPreviewSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(
          409,
          'The batch has conflicts (`SUBJECT_BINDING_CONFLICTS`).',
        ),
      },
    }),
    apiValidator('json', SubjectBindingBatchInput),
    async (context) =>
      context.json({
        data: await services().bindings.commit(
          context.req.valid('json').rows,
          actorOf(context),
        ),
      }),
  );

  router.post(
    '/subjectBindings/:bindingId/revoke',
    permit(SETTINGS_SUBJECT_BINDINGS, 'revoke'),
    describeRoute({
      tags,
      summary: 'Revoke a subject binding and bump its revision',
      operationId: 'casdoorIdentityRevokeSubjectBinding',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SUBJECT_BINDINGS}\` revoke. Outstanding tickets and embeds that captured the previous revision become unusable.`,
      responses: {
        200: dataResponse(SubjectBindingSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const bindingId = context.req.param('bindingId');
      if (!bindingId) {
        throw new Error('bindingId is required');
      }
      return context.json({
        data: await services().bindings.revoke(bindingId, actorOf(context)),
      });
    },
  );

  router.post(
    '/subjectBindings/:bindingId/reEnable',
    permit(SETTINGS_SUBJECT_BINDINGS, 'revoke'),
    describeRoute({
      tags,
      summary: 'Re-enable a revoked subject binding with a new revision',
      operationId: 'casdoorIdentityReEnableSubjectBinding',
      ...cliRoute(false),
      description: `Requires \`${SETTINGS_SUBJECT_BINDINGS}\` revoke. Old tickets and embeds remain invalid after re-enable.`,
      responses: {
        200: dataResponse(SubjectBindingSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const bindingId = context.req.param('bindingId');
      if (!bindingId) {
        throw new Error('bindingId is required');
      }
      return context.json({
        data: await services().bindings.reEnable(bindingId, actorOf(context)),
      });
    },
  );

  return router;
}
