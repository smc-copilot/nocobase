import { z } from 'zod';

import { APP_TYPES, AUTO_LAUNCH_MODES, CASDOOR_AUTH_MODES } from '../config.js';
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
  CasdoorUserView,
} from '../services/casdoor-management-client.js';
import type { UserApplicationGrants } from '../services/casdoor-application-grants.js';

export const AppCodeParam: z.ZodType<{ appCode: string }> = z.object({
  appCode: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    .max(64),
});

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
  page: number;
  pageSize: number;
}> = z.object({
  organization: z.string().min(1).max(100).optional(),
  q: z.string().max(200).optional(),
  ...pageQuery,
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
    isForbidden: z.boolean(),
    isDeleted: z.boolean(),
  })
  .meta({ ref: 'EnterpriseAppPortalCasdoorUser' });

export const CasdoorApplicationSchema: z.ZodType<CasdoorApplicationView> = z
  .object({
    name: z.string().meta({ description: 'Casdoor application name.' }),
    displayName: z.string(),
    organization: z.string(),
    owner: z.string(),
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
