import { ApiError } from '@nocobase/app-server/router';

import {
  MAX_ACCESS_CACHE_TTL_MS,
  type AccessSource,
  type ContractFixtureGrant,
  type EnterpriseAppPortalAccessConfig,
} from '../config.js';
import { portalError } from '../errors.js';
import {
  CasdoorManagementError,
  namespacedPermissionName,
  type CasdoorManagementClient,
  type EnforceDecision,
} from './casdoor-management-client.js';

export interface AccessIdentity {
  readonly userId: string;
  readonly username?: string | null;
  /**
   * Verified Casdoor Enforce subject (`owner/name`), resolved from
   * `externalIdentities` — never guessed from username alone.
   */
  readonly casdoorUserId?: string | null;
  /** Verified claims from a just-validated token or a fresh directory snapshot. */
  readonly claims?: Readonly<Record<string, unknown>>;
  readonly claimsObservedAt?: Date;
}

export interface AccessQueryOptions {
  /** When true, skip the per-user authorized-app cache (redeem path). */
  readonly bypassCache?: boolean;
  /**
   * When true, refuse username `{org}/{name}` fallback and require
   * `casdoorUserId` or verified claims.
   */
  readonly requireBinding?: boolean;
}

export interface AccessDecision {
  readonly appKeys: readonly string[];
  readonly source: AccessSource;
}

interface CacheEntry {
  readonly appKeys: readonly string[];
  readonly expiresAt: number;
}

export interface PortalAccessTarget {
  readonly appCode: string;
  readonly casdoorAppKey: string | null;
}

export interface CasdoorAccessDeps {
  readonly client?: () => CasdoorManagementClient | undefined;
  readonly targets?: () => Promise<readonly PortalAccessTarget[]>;
}

function readClaim(
  attributes: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  let current: unknown = attributes;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
  }
  if (typeof value === 'string' && value !== '') return [value];
  return [];
}

/**
 * Casdoor is the application-access authority. This adapter never treats the
 * administrator catalog or a local Permission Set as authorization.
 *
 * `managementApi` enforces the namespaced application permission for each catalog
 * target and returns catalog `appCode`s. Casdoor errors fail closed and are not cached.
 */
export class CasdoorApplicationAccessAdapter {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: () => EnterpriseAppPortalAccessConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly deps: CasdoorAccessDeps = {},
  ) {}

  public clearCache(): void {
    this.cache.clear();
  }

  public async listAuthorizedAppKeys(
    identity: AccessIdentity,
    options: AccessQueryOptions = {},
  ): Promise<AccessDecision> {
    const source = this.config().source ?? 'unconfigured';
    if (source === 'unconfigured') {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'Casdoor application access is not configured; refusing by default.',
      );
    }
    const ttl = Math.min(
      this.config().cacheTtlMs ?? MAX_ACCESS_CACHE_TTL_MS,
      MAX_ACCESS_CACHE_TTL_MS,
    );
    const cached = this.cache.get(identity.userId);
    const now = this.now().getTime();
    if (!options.bypassCache && cached && cached.expiresAt > now) {
      return { appKeys: cached.appKeys, source };
    }
    const appKeys = await this.resolve(source, identity, options);
    if (!options.bypassCache) {
      this.cache.set(identity.userId, { appKeys, expiresAt: now + ttl });
    }
    return { appKeys, source };
  }

  public async assertAuthorized(
    identity: AccessIdentity,
    appCode: string,
    options: AccessQueryOptions = {},
  ): Promise<void> {
    const decision = await this.listAuthorizedAppKeys(identity, options);
    if (!decision.appKeys.includes(appCode)) {
      throw portalError(
        'PERMISSION_DENIED',
        'APP_ACCESS_DENIED',
        'The caller is not authorized for this application.',
      );
    }
  }

  private async resolve(
    source: AccessSource,
    identity: AccessIdentity,
    options: AccessQueryOptions,
  ): Promise<readonly string[]> {
    if (source === 'contractFixture') {
      return this.fromFixture(identity);
    }
    if (source === 'verifiedClaims') {
      return this.fromClaims(identity);
    }
    if (source === 'managementApi') {
      return this.fromManagementApi(identity, options);
    }
    throw portalError(
      'UNAVAILABLE',
      'CASDOOR_AUTHORIZATION_UNAVAILABLE',
      'Casdoor application access is not configured; refusing by default.',
    );
  }

  private async fromManagementApi(
    identity: AccessIdentity,
    options: AccessQueryOptions,
  ): Promise<readonly string[]> {
    const client = this.deps.client?.();
    if (!client || !this.deps.targets) {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'Casdoor Management API access is not configured; refusing by default.',
      );
    }
    const subject = casdoorSubject(
      identity,
      client.organization(),
      options.requireBinding === true,
    );
    if (!subject) {
      throw portalError(
        options.requireBinding ? 'PERMISSION_DENIED' : 'UNAVAILABLE',
        options.requireBinding
          ? 'IDENTITY_BINDING_REQUIRED'
          : 'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'No Casdoor user id is available for application access.',
      );
    }
    let targets: readonly PortalAccessTarget[];
    try {
      targets = await this.deps.targets();
    } catch (error) {
      throw managementUnavailable(error);
    }
    const prefix = client.permissionNamePrefix();
    const owner = client.permissionOwner();
    const allowed: string[] = [];
    for (const target of targets) {
      const applicationName =
        (target.casdoorAppKey ?? '').trim() || target.appCode;
      const permissionName = namespacedPermissionName(prefix, applicationName);
      if (
        !applicationName ||
        applicationName.includes('/') ||
        permissionName.length > 100
      ) {
        continue;
      }
      let decision: EnforceDecision;
      try {
        decision = await client.enforce({
          permissionId: `${owner}/${permissionName}`,
          subject,
          resource: applicationName,
          action: 'Read',
        });
      } catch (error) {
        throw managementUnavailable(error);
      }
      if (decision === 'allow') allowed.push(target.appCode);
    }
    return [...new Set(allowed)];
  }

  private fromFixture(identity: AccessIdentity): readonly string[] {
    const grants = this.config().fixtureGrants ?? [];
    const match = grants.find(
      (grant) =>
        (grant.userId && grant.userId === identity.userId) ||
        (grant.username &&
          identity.username &&
          grant.username.toLowerCase() === identity.username.toLowerCase()),
    );
    return match ? [...match.appCodes] : [];
  }

  private fromClaims(identity: AccessIdentity): readonly string[] {
    const path = this.config().claimPath;
    if (!path) {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'verifiedClaims source requires access.claimPath.',
      );
    }
    const observedAt = identity.claimsObservedAt?.getTime();
    const ageOk =
      identity.claims != null &&
      observedAt != null &&
      this.now().getTime() - observedAt <= MAX_ACCESS_CACHE_TTL_MS;
    if (!ageOk) {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'No fresh verified Casdoor claims are available for application access.',
      );
    }
    const values = asStrings(readClaim(identity.claims, path));
    const mapping = this.config().groupToApp ?? {};
    const mapped = values
      .map((value) => mapping[value] ?? value)
      .filter((value) => value.length > 0);
    return [...new Set(mapped)];
  }
}

function managementUnavailable(error: unknown): ApiError {
  if (isPortalError(error)) return error;
  const message =
    error instanceof CasdoorManagementError
      ? error.message
      : 'Casdoor management request failed.';
  return portalError(
    'UNAVAILABLE',
    'CASDOOR_AUTHORIZATION_UNAVAILABLE',
    message,
  );
}

function isPortalError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function casdoorSubject(
  identity: AccessIdentity,
  organization: string,
  requireBinding: boolean,
): string | undefined {
  if (identity.casdoorUserId && isCasdoorId(identity.casdoorUserId.trim())) {
    return identity.casdoorUserId.trim();
  }
  const claimId = stringClaim(identity.claims, 'id');
  if (isCasdoorId(claimId)) return claimId;
  const sub = stringClaim(identity.claims, 'sub');
  if (isCasdoorId(sub)) return sub;
  if (isCasdoorId(identity.userId)) return identity.userId;
  if (requireBinding) return undefined;
  const name =
    identity.username?.trim() ||
    stringClaim(identity.claims, 'name') ||
    stringClaim(identity.claims, 'preferred_username');
  if (name && !name.includes('/') && organization)
    return `${organization}/${name}`;
  return undefined;
}

function stringClaim(
  claims: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = claims?.[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function isCasdoorId(value: string | undefined): value is string {
  if (!value) return false;
  const slash = value.indexOf('/');
  return (
    slash > 0 && slash === value.lastIndexOf('/') && slash < value.length - 1
  );
}

export type { ContractFixtureGrant };
