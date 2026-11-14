/**
 * Grant carried by an agent access token. The adapter does not own grant rows;
 * `requireGrant` loads the current grant from agent-authorization (or a test double).
 */
export interface GrantContext {
  readonly grantId: string;
  readonly clientId: string;
  readonly localUserId: string;
  readonly audience: string;
  /** Full grant scopes. Effective access is the intersection below. */
  readonly scopes: readonly string[];
  /**
   * Scopes on the presented access token. Omitted means "same as `scopes`"
   * so callers that only know the grant do not accidentally widen it.
   */
  readonly tokenScopes?: readonly string[];
  /**
   * Current client `allowedScopes`. Omitted means no extra client filter;
   * the require-grant path loads them so a later client shrink takes effect.
   */
  readonly clientScopes?: readonly string[];
  readonly revision: number;
}

/**
 * Who is calling a user-facing protocol route.
 * An agent access token carries its grant; a browser session is limited to
 * the embed redeemed into that session.
 */
export type CallerContext =
  | { readonly kind: 'agent'; readonly grant: GrantContext }
  | { readonly kind: 'embed'; readonly sessionRef: string };

function intersect(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const allowed = new Set(right);
  return left.filter((scope) => allowed.has(scope));
}

/**
 * grant.scopes ∩ tokenScopes ∩ clientScopes.
 * Missing tokenScopes uses the grant scopes. Missing clientScopes adds no filter.
 */
export function effectiveScopes(grant: GrantContext): readonly string[] {
  const grantScopes = grant.scopes ?? [];
  const tokenScopes = grant.tokenScopes ?? grantScopes;
  const narrowed = intersect(grantScopes, tokenScopes);
  if (!grant.clientScopes) return narrowed;
  return intersect(narrowed, grant.clientScopes);
}

/**
 * Subset of the planned `@nocobase/app-plugin-agent-authorization` service.
 * The plugin token is resolved structurally so this package typechecks before
 * those methods are exported.
 */
export interface AgentGrantSource {
  resolveGrant?(credentialData: unknown): GrantContext | undefined;
  requireGrant?(grantId: string): Promise<GrantContext>;
  audience?(): string;
}

/** Reads the credential payload `agentAccessToken` stores on the session. */
export function grantContextFromCredentialData(
  userId: string,
  credentialData: unknown,
): GrantContext | undefined {
  if (!credentialData || typeof credentialData !== 'object') return undefined;
  const record = credentialData as Record<string, unknown>;
  const grantId =
    typeof record.grantId === 'string' ? record.grantId : undefined;
  const clientId =
    typeof record.clientId === 'string' ? record.clientId : undefined;
  const revision =
    typeof record.grantRevision === 'number'
      ? record.grantRevision
      : typeof record.revision === 'number'
        ? record.revision
        : undefined;
  if (
    !grantId ||
    !clientId ||
    revision == null ||
    !Number.isInteger(revision)
  ) {
    return undefined;
  }
  const scopes = Array.isArray(record.scopes)
    ? record.scopes.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : typeof record.scope === 'string'
      ? record.scope.split(/\s+/).filter(Boolean)
      : [];
  return {
    grantId,
    clientId,
    localUserId: userId,
    audience: typeof record.audience === 'string' ? record.audience : '',
    scopes,
    tokenScopes: scopes,
    revision,
  };
}
