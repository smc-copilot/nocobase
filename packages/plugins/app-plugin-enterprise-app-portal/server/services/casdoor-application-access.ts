import {
  MAX_ACCESS_CACHE_TTL_MS,
  type AccessSource,
  type ContractFixtureGrant,
  type EnterpriseAppPortalAccessConfig,
} from '../config.js';
import { portalError } from '../errors.js';

export interface AccessIdentity {
  readonly userId: string;
  readonly username?: string | null;
  /** Verified claims from a just-validated token or a fresh directory snapshot. */
  readonly claims?: Readonly<Record<string, unknown>>;
  readonly claimsObservedAt?: Date;
}

export interface AccessDecision {
  readonly appKeys: readonly string[];
  readonly source: AccessSource;
}

interface CacheEntry {
  readonly appKeys: readonly string[];
  readonly expiresAt: number;
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
 * The live Casdoor Management API / token claim contract is not verified in this
 * repository. Until an operator sets a proven source, the adapter stays
 * `unconfigured` and fails closed.
 */
export class CasdoorApplicationAccessAdapter {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: () => EnterpriseAppPortalAccessConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public clearCache(): void {
    this.cache.clear();
  }

  public async listAuthorizedAppKeys(
    identity: AccessIdentity,
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
    if (cached && cached.expiresAt > now) {
      return { appKeys: cached.appKeys, source };
    }
    const appKeys = await this.resolve(source, identity);
    this.cache.set(identity.userId, { appKeys, expiresAt: now + ttl });
    return { appKeys, source };
  }

  public async assertAuthorized(
    identity: AccessIdentity,
    appCode: string,
  ): Promise<void> {
    const decision = await this.listAuthorizedAppKeys(identity);
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
  ): Promise<readonly string[]> {
    if (source === 'contractFixture') {
      return this.fromFixture(identity);
    }
    if (source === 'verifiedClaims') {
      return this.fromClaims(identity);
    }
    if (source === 'managementApi') {
      throw portalError(
        'UNAVAILABLE',
        'CASDOOR_AUTHORIZATION_UNAVAILABLE',
        'Casdoor Management API access is declared but the live contract is not verified; refusing by default.',
      );
    }
    throw portalError(
      'UNAVAILABLE',
      'CASDOOR_AUTHORIZATION_UNAVAILABLE',
      'Casdoor application access is not configured; refusing by default.',
    );
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

export type { ContractFixtureGrant };
