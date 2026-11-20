import { z } from 'zod';

import {
  APP_TYPES,
  AUTO_LAUNCH_MODES,
  CASDOOR_AUTH_MODES,
  OCTOP_API_AUTH_MODES,
} from '../config.js';
import type {
  AuthorizedApplicationView,
  LaunchResult,
} from '../services/application-launch.js';
import type { PortalApplicationRecord } from '../services/application-catalog.js';
import type { PortalUserPreferences } from '../services/user-preferences.js';
import type { AccessAuditRecord } from '../services/access-audit.js';
import type {
  CasdoorApplicationView,
  CasdoorConnectionStatus,
  CasdoorGroupView,
  CasdoorUserView,
} from '../services/casdoor-management-client.js';
import type { UserApplicationGrants } from '../services/casdoor-application-grants.js';
import type {
  AgentGrantApplicationView,
  AgentGrantCreateOptions,
  AuthorizedEmployeeView,
  EmployeeOctopState,
} from '../services/agent-grants-read.js';
import type { OctopPublishedExpert } from '../services/octop-management-client.js';

export const AppCodeParam: z.ZodType<{ appCode: string }> = z.object({
  appCode: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    .max(64),
});

const envName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
  .max(128);

export const CatalogCreateInput: z.ZodType<{
  appCode: string;
  name: string;
  appType: (typeof APP_TYPES)[number];
  businessCenter?: string | null;
  description?: string | null;
  icon?: string | null;
  baseUrl: string;
  targetPath?: string;
  healthUrl?: string | null;
  casdoorAppKey?: string | null;
  enabled?: boolean;
  sortOrder?: number;
  agentGrantsEnabled?: boolean;
  supportsInstallAsUser?: boolean;
  apiBaseUrl?: string | null;
  apiAuthMode?: (typeof OCTOP_API_AUTH_MODES)[number] | null;
  apiTokenEnv?: string | null;
  apiUsernameEnv?: string | null;
  apiPasswordEnv?: string | null;
}> = z.strictObject({
  appCode: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    .max(64)
    .refine((value) => value !== 'admin', {
      message: '`admin` is a reserved segment.',
    }),
  name: z.string().min(1).max(128),
  appType: z.enum(APP_TYPES),
  businessCenter: z.string().max(128).nullable().optional(),
  description: z.string().max(512).nullable().optional(),
  icon: z.string().max(255).nullable().optional(),
  baseUrl: z.string().url().max(512),
  targetPath: z.string().max(512).optional(),
  healthUrl: z.string().url().max(512).nullable().optional(),
  casdoorAppKey: z.string().max(128).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  agentGrantsEnabled: z.boolean().optional(),
  supportsInstallAsUser: z.boolean().optional(),
  apiBaseUrl: z.string().max(512).nullable().optional(),
  apiAuthMode: z.enum(OCTOP_API_AUTH_MODES).nullable().optional(),
  apiTokenEnv: envName.nullable().optional(),
  apiUsernameEnv: envName.nullable().optional(),
  apiPasswordEnv: envName.nullable().optional(),
});

export const CatalogUpdateInput: z.ZodType<{
  name?: string;
  appType?: (typeof APP_TYPES)[number];
  businessCenter?: string | null;
  description?: string | null;
  icon?: string | null;
  baseUrl?: string;
  targetPath?: string;
  healthUrl?: string | null;
  casdoorAppKey?: string | null;
  enabled?: boolean;
  sortOrder?: number;
  agentGrantsEnabled?: boolean;
  supportsInstallAsUser?: boolean;
  apiBaseUrl?: string | null;
  apiAuthMode?: (typeof OCTOP_API_AUTH_MODES)[number] | null;
  apiTokenEnv?: string | null;
  apiUsernameEnv?: string | null;
  apiPasswordEnv?: string | null;
}> = z.strictObject({
  name: z.string().min(1).max(128).optional(),
  appType: z.enum(APP_TYPES).optional(),
  businessCenter: z.string().max(128).nullable().optional(),
  description: z.string().max(512).nullable().optional(),
  icon: z.string().max(255).nullable().optional(),
  baseUrl: z.string().url().max(512).optional(),
  targetPath: z.string().max(512).optional(),
  healthUrl: z.string().url().max(512).nullable().optional(),
  casdoorAppKey: z.string().max(128).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  agentGrantsEnabled: z.boolean().optional(),
  supportsInstallAsUser: z.boolean().optional(),
  apiBaseUrl: z.string().max(512).nullable().optional(),
  apiAuthMode: z.enum(OCTOP_API_AUTH_MODES).nullable().optional(),
  apiTokenEnv: envName.nullable().optional(),
  apiUsernameEnv: envName.nullable().optional(),
  apiPasswordEnv: envName.nullable().optional(),
});

export const PreferencesInput: z.ZodType<{
  autoLaunchMode?: (typeof AUTO_LAUNCH_MODES)[number];
  defaultAppCode?: string | null;
}> = z.strictObject({
  autoLaunchMode: z.enum(AUTO_LAUNCH_MODES).optional(),
  defaultAppCode: z.string().max(64).nullable().optional(),
});

export const AuditQuery: z.ZodType<{ limit?: number }> = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const CatalogApplicationSchema: z.ZodType<
  Omit<PortalApplicationRecord, 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
  }
> = z
  .object({
    id: z.string(),
    appCode: z.string(),
    name: z.string(),
    appType: z.enum(APP_TYPES),
    businessCenter: z.string().nullable(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    baseUrl: z.string(),
    targetPath: z.string(),
    healthUrl: z.string().nullable(),
    casdoorAppKey: z.string().nullable(),
    enabled: z.boolean(),
    sortOrder: z.number(),
    agentGrantsEnabled: z.boolean(),
    supportsInstallAsUser: z.boolean(),
    apiBaseUrl: z.string().nullable(),
    apiAuthMode: z.string().nullable(),
    apiTokenEnv: z.string().nullable(),
    apiUsernameEnv: z.string().nullable(),
    apiPasswordEnv: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'EnterpriseAppPortalApplication' });

export const AuthorizedApplicationSchema: z.ZodType<AuthorizedApplicationView> =
  z
    .object({
      appCode: z.string(),
      name: z.string(),
      appType: z.string(),
      businessCenter: z.string().nullable(),
      description: z.string().nullable(),
      icon: z.string().nullable(),
      enabled: z.boolean(),
      health: z.enum(['healthy', 'unhealthy', 'unknown']),
      isDefault: z.boolean(),
    })
    .meta({ ref: 'EnterpriseAppPortalAuthorizedApplication' });

export const EmployeeCatalogSchema: z.ZodType<{
  applications: AuthorizedApplicationView[];
  autoLaunchMode: (typeof AUTO_LAUNCH_MODES)[number];
  suggestedAppCode: string | null;
  isolationNotice: boolean;
}> = z
  .object({
    applications: z.array(AuthorizedApplicationSchema),
    autoLaunchMode: z.enum(AUTO_LAUNCH_MODES),
    suggestedAppCode: z.string().nullable(),
    isolationNotice: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalEmployeeCatalog' });

export const LaunchResultSchema: z.ZodType<LaunchResult> = z
  .object({
    appCode: z.string(),
    name: z.string(),
    url: z.string(),
  })
  .meta({ ref: 'EnterpriseAppPortalLaunchResult' });

export const PreferencesSchema: z.ZodType<
  Omit<PortalUserPreferences, 'updatedAt'> & { updatedAt: string }
> = z
  .object({
    userId: z.string(),
    autoLaunchMode: z.enum(AUTO_LAUNCH_MODES),
    defaultAppCode: z.string().nullable(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'EnterpriseAppPortalPreferences' });

export const AuditEventSchema: z.ZodType<
  Omit<AccessAuditRecord, 'createdAt' | 'metadata'> & {
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }
> = z
  .object({
    id: z.string(),
    actorUserId: z.string().nullable(),
    appCode: z.string().nullable(),
    action: z.string(),
    result: z.enum(['success', 'denied', 'unavailable', 'conflict']),
    reason: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'EnterpriseAppPortalAuditEvent' });

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
};

export const CasdoorUserQuery: z.ZodType<{
  organization?: string;
  q?: string;
  groupName?: string;
  page: number;
  pageSize: number;
}> = z.object({
  organization: z.string().min(1).max(100).optional(),
  q: z.string().max(200).optional(),
  groupName: z.string().min(1).max(200).optional(),
  ...pageQuery,
});

export const CasdoorGroupQuery: z.ZodType<{
  organization?: string;
}> = z.object({
  organization: z.string().min(1).max(100).optional(),
});

export const CasdoorApplicationQuery: z.ZodType<{
  owner?: string;
  page: number;
  pageSize: number;
}> = z.object({
  owner: z.string().min(1).max(100).optional(),
  ...pageQuery,
});

export const CasdoorUserParam: z.ZodType<{ owner: string; name: string }> =
  z.object({
    owner: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[^/]+$/u),
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[^/]+$/u),
  });

export const ApplicationGrantReplaceInput: z.ZodType<{
  applicationNames: string[];
}> = z.strictObject({
  applicationNames: z.array(z.string().min(1).max(80)).max(200),
});

export const CasdoorUserSchema: z.ZodType<CasdoorUserView> = z
  .object({
    id: z.string().meta({ description: 'Casdoor user id, owner/name.' }),
    owner: z.string(),
    name: z.string(),
    displayName: z.string(),
    email: z.string(),
    phone: z.string(),
    avatar: z.string(),
    title: z.string(),
    affiliation: z.string(),
    groups: z.array(z.string()),
    isForbidden: z.boolean(),
    isDeleted: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorUser' });

export const CasdoorGroupSchema: z.ZodType<CasdoorGroupView> = z
  .object({
    id: z.string().meta({ description: 'Casdoor group id, owner/name.' }),
    owner: z.string(),
    name: z.string(),
    displayName: z.string(),
    parentId: z.string(),
    parentName: z.string(),
    isTopGroup: z.boolean(),
    haveChildren: z.boolean(),
    type: z.string(),
    isEnabled: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorGroup' });

export const CasdoorApplicationSchema: z.ZodType<CasdoorApplicationView> = z
  .object({
    name: z.string().meta({ description: 'Casdoor application name.' }),
    displayName: z.string(),
    organization: z.string(),
    owner: z.string(),
    homepageUrl: z.string(),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorApplication' });

export const CasdoorConnectionSchema: z.ZodType<CasdoorConnectionStatus> = z
  .object({
    ok: z.literal(true),
    organization: z.string(),
    applicationOwner: z.string(),
    permissionOwner: z.string(),
    auth: z.enum(CASDOOR_AUTH_MODES),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorConnection' });

export const CasdoorUserGrantsSchema: z.ZodType<UserApplicationGrants> = z
  .object({
    casdoorUserId: z.string(),
    grants: z.array(
      z.object({
        applicationName: z.string(),
        permissionName: z.string(),
        source: z.enum(['direct', 'inherited']),
        enforced: z.boolean(),
        viaGroups: z.array(z.string()),
        viaRoles: z.array(z.string()),
        viaUsers: z.array(z.string()),
      }),
    ),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorUserGrants' });

export const AgentGrantEmployeeParam: z.ZodType<{
  appCode: string;
  owner: string;
  name: string;
}> = z.object({
  appCode: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    .max(64),
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^/]+$/u),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^/]+$/u),
});

export const AgentGrantOperationParam: z.ZodType<{ operationId: string }> =
  z.object({
    operationId: z.string().uuid(),
  });

export const OctopInstanceConfigInput: z.ZodType<{
  agentGrantsEnabled: boolean;
  supportsInstallAsUser: boolean;
  apiBaseUrl: string | null;
  apiAuthMode: (typeof OCTOP_API_AUTH_MODES)[number] | null;
  apiTokenEnv: string | null;
  apiUsernameEnv: string | null;
  apiPasswordEnv: string | null;
}> = z.strictObject({
  agentGrantsEnabled: z.boolean(),
  supportsInstallAsUser: z.boolean(),
  apiBaseUrl: z.string().max(512).nullable(),
  apiAuthMode: z.enum(OCTOP_API_AUTH_MODES).nullable(),
  apiTokenEnv: envName.nullable(),
  apiUsernameEnv: envName.nullable(),
  apiPasswordEnv: envName.nullable(),
});

export const AgentGrantCreateInput: z.ZodType<{
  casdoorUserId: string;
  role?: string;
  workspaceRootDir?: string | null;
  tokenQuota?: number | null;
  maxAgents?: number | null;
  directory?: boolean;
  password?: string | null;
  expertTemplateIds: string[];
  defaultExpertTemplateId?: string | null;
}> = z.strictObject({
  casdoorUserId: z
    .string()
    .regex(/^[^/]+\/[^/]+$/u)
    .max(128),
  role: z.string().min(1).max(64).optional(),
  workspaceRootDir: z.string().max(512).nullable().optional(),
  tokenQuota: z.number().int().nullable().optional(),
  maxAgents: z.number().int().nullable().optional(),
  directory: z.boolean().optional(),
  password: z.string().min(8).max(128).nullable().optional(),
  expertTemplateIds: z.array(z.string().min(1).max(128)).max(50),
  defaultExpertTemplateId: z.string().min(1).max(128).nullable().optional(),
});

export const AgentGrantApplicationSchema: z.ZodType<AgentGrantApplicationView> =
  z
    .object({
      appCode: z.string(),
      name: z.string(),
      appType: z.literal('octop'),
      casdoorAppKey: z.string().nullable(),
      enabled: z.boolean(),
      agentGrantsEnabled: z.boolean(),
      supportsInstallAsUser: z.boolean(),
      apiBaseUrl: z.string().nullable(),
      apiAuthMode: z.string().nullable(),
      apiTokenEnv: z.string().nullable(),
      apiUsernameEnv: z.string().nullable(),
      apiPasswordEnv: z.string().nullable(),
    })
    .meta({ ref: 'EnterpriseAppPortalAgentGrantApplication' });

export const AuthorizedEmployeeSchema: z.ZodType<AuthorizedEmployeeView> = z
  .object({
    casdoorUserId: z.string(),
    username: z.string(),
    displayName: z.string(),
    email: z.string(),
    accountExists: z.boolean(),
    octopUserId: z.string().nullable(),
    disabled: z.boolean(),
    syncedAt: z.string().nullable(),
    experts: z.array(
      z.object({
        agentId: z.string(),
        publishedExpertId: z.string().nullable(),
        name: z.string().nullable(),
        state: z.string().nullable(),
        bootstrapPending: z.boolean(),
        kind: z.string().nullable(),
      }),
    ),
  })
  .meta({ ref: 'EnterpriseAppPortalAuthorizedEmployee' });

export const EmployeeOctopStateSchema: z.ZodType<EmployeeOctopState> = z
  .object({
    casdoorUserId: z.string(),
    username: z.string(),
    accountExists: z.boolean(),
    disabled: z.boolean(),
    octopUserId: z.string().nullable(),
    experts: z.array(
      z.object({
        agentId: z.string(),
        publishedExpertId: z.string().nullable(),
        name: z.string().nullable(),
        state: z.string().nullable(),
        bootstrapPending: z.boolean(),
        kind: z.string().nullable(),
      }),
    ),
  })
  .meta({ ref: 'EnterpriseAppPortalEmployeeOctopState' });

export const PublishedExpertSchema: z.ZodType<OctopPublishedExpert> = z
  .object({
    id: z.string(),
    slug: z.string().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    creatorUsername: z.string().nullable(),
    iconUrl: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .meta({ ref: 'EnterpriseAppPortalPublishedExpert' });

export const AgentGrantCreateOptionsSchema: z.ZodType<AgentGrantCreateOptions> =
  z
    .object({
      roles: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          systemRole: z.string().nullable(),
          permissions: z.array(z.string()),
          maxAgents: z.number().nullable(),
          tokenQuota: z.number().nullable(),
          workspaceRootDir: z.string().nullable(),
          allowedBackendTypes: z.array(z.string()),
        }),
      ),
      ldapConfigured: z.boolean(),
      allowedBackendTypes: z.tuple([z.literal('docker')]),
      expertTemplateSource: z.literal('published'),
    })
    .meta({ ref: 'EnterpriseAppPortalAgentGrantCreateOptions' });

export const AgentGrantRevokeUnsyncedSchema: z.ZodType<{
  casdoorUserId: string;
  applicationName: string;
  stillAuthorized: boolean;
}> = z
  .object({
    casdoorUserId: z.string(),
    applicationName: z.string(),
    stillAuthorized: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalAgentGrantRevokeUnsynced' });

export const OctopConnectionTestSchema: z.ZodType<{
  ok: true;
  authMode: (typeof OCTOP_API_AUTH_MODES)[number];
  healthOk: boolean;
}> = z
  .object({
    ok: z.literal(true),
    authMode: z.enum(OCTOP_API_AUTH_MODES),
    healthOk: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalOctopConnectionTest' });

export const AgentGrantOperationSchema: z.ZodType<{
  id: string;
  appCode: string;
  casdoorUserId: string;
  username: string;
  actorUserId: string;
  status: string;
  operationMode: string | null;
  selectedExpertCount: number;
  completedExpertCount: number;
  failedExpertCount: number;
  skippedExpertCount: number;
  expertTemplateId: string | null;
  createOptionsSnapshot: Record<string, unknown>;
  octopUserId: string | null;
  agentId: string | null;
  bootstrapStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}> = z
  .object({
    id: z.string(),
    appCode: z.string(),
    casdoorUserId: z.string(),
    username: z.string(),
    actorUserId: z.string(),
    status: z.string(),
    operationMode: z.string().nullable(),
    selectedExpertCount: z.number().int(),
    completedExpertCount: z.number().int(),
    failedExpertCount: z.number().int(),
    skippedExpertCount: z.number().int(),
    expertTemplateId: z.string().nullable(),
    createOptionsSnapshot: z.record(z.string(), z.unknown()),
    octopUserId: z.string().nullable(),
    agentId: z.string().nullable(),
    bootstrapStatus: z.string().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .meta({ ref: 'EnterpriseAppPortalAgentGrantOperation' });

export const AgentGrantExpertItemSchema: z.ZodType<{
  id: string;
  operationId: string;
  expertTemplateId: string;
  expertName: string;
  status: string;
  agentId: string | null;
  bootstrapPending: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}> = z
  .object({
    id: z.string(),
    operationId: z.string(),
    expertTemplateId: z.string(),
    expertName: z.string(),
    status: z.string(),
    agentId: z.string().nullable(),
    bootstrapPending: z.boolean().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .meta({ ref: 'EnterpriseAppPortalAgentGrantExpertItem' });
