/**
 * Grant carried by an agent access token. The adapter does not own grant rows;
 * `requireGrant` loads the current grant from agent-authorization (or a test double).
 */
export interface GrantContext {
  readonly grantId: string;
  readonly clientId: string;
  readonly localUserId: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly revision: number;
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
    revision,
  };
}
