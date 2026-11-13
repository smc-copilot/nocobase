import type { DatabaseManager } from '@nocobase/db';
import type {
  Auth,
  UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import type { PermissionSetsApi } from '@nocobase/app-plugin-authorization';

import type { CasdoorIdentityConfig } from '../config.js';

/** Verified facts about one external user: from a verified JWT or from the trusted directory. */
export interface ExternalIdentityClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  /** Allowlisting by e-mail requires this to be `true`. */
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly organization?: string;
  readonly groups: readonly string[];
  /** The raw attribute bag, for dotted-path mapping rules. */
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** Where each logical field lives in the attribute bag, as dotted paths. */
export interface ClaimMapping {
  readonly email?: string;
  readonly emailVerified?: string;
  readonly name?: string;
  readonly organization?: string;
  readonly groups?: string;
}

/**
 * Who may be admitted. Deny rules win; otherwise an identity must match at least one allow
 * list. A policy with every allow list empty admits nobody (deny by default).
 */
export interface AdmissionPolicy {
  readonly allowOrganizations?: readonly string[];
  readonly allowGroups?: readonly string[];
  readonly allowEmails?: readonly string[];
  readonly allowEmailDomains?: readonly string[];
  readonly allowSubjects?: readonly string[];
  readonly denyOrganizations?: readonly string[];
  readonly denyGroups?: readonly string[];
  readonly denySubjects?: readonly string[];
}

export interface IdentityProviderRecord {
  readonly id: string;
  readonly providerId: string;
  readonly issuer: string;
  readonly clientId: string | null;
  readonly secretRef: string | null;
  readonly claimMapping: ClaimMapping;
  readonly admissionPolicy: AdmissionPolicy;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MappingRuleRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly providerId: string;
  readonly claim: string;
  readonly claimValue: string;
  readonly permissionSetKey: string;
  readonly enabled: boolean;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The slice of the Permission Sets API the adapter needs. */
export type ManagedPermissionSets = Pick<
  PermissionSetsApi,
  'get' | 'assign' | 'revoke' | 'listAssignments' | 'protection'
>;

/** Everything the identity services borrow from the host application, resolved lazily. */
export interface IdentityRuntime {
  readonly database: () => DatabaseManager;
  readonly auth: () => Auth;
  readonly users: () => UserAdministrationService;
  /** Undefined when the application runs without the authorization plugin. */
  readonly permissionSets: () => ManagedPermissionSets | undefined;
  readonly config: () => CasdoorIdentityConfig;
  readonly now?: () => Date;
}

export function nowOf(runtime: IdentityRuntime): Date {
  return runtime.now ? runtime.now() : new Date();
}
