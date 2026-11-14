/**
 * Maps `form.permissionRef` onto a native Authorization resource/action check.
 *
 * Supported shapes:
 * - `generic.request:edit` → resource type `generic.request`, action `edit`
 * - `generic.request/edit` → same
 *
 * Unknown or unparseable refs deny. The adapter never invents grants: the installing
 * application supplies {@link BusinessAccessChecker}, typically via
 * {@link createNativeBusinessAccessChecker}.
 */

import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

export type BusinessAction =
  'issue' | 'save' | 'submit' | 'view' | 'query' | 'retry';

export interface BusinessAccessRequest {
  readonly userId: string;
  readonly permissionRef: string | null | undefined;
  readonly action: BusinessAction;
  /** Formal or draft record when the action targets an existing document. */
  readonly recordId?: string | null;
}

export type BusinessAccessChecker = (
  request: BusinessAccessRequest,
) => Promise<boolean>;

export function parsePermissionRef(
  permissionRef: string,
): { readonly resourceType: string; readonly action: string } | undefined {
  const trimmed = permissionRef.trim();
  if (!trimmed) return undefined;
  const colon = trimmed.indexOf(':');
  const slash = trimmed.indexOf('/');
  const index =
    colon >= 0 && (slash < 0 || colon < slash)
      ? colon
      : slash >= 0
        ? slash
        : -1;
  if (index <= 0 || index === trimmed.length - 1) return undefined;
  return {
    resourceType: trimmed.slice(0, index),
    action: trimmed.slice(index + 1),
  };
}

/**
 * Default when the application did not wire Authorization: deny every business
 * action. A local identity or active binding alone never grants document access.
 */
export const denyWithoutPermissionRef: BusinessAccessChecker = async () =>
  false;

/**
 * Native Authorization checker: maps `permissionRef` to
 * `authz.for({ principal: user }).can({ resource, action })`.
 * Unparseable or empty refs deny. Absent Authorization is a caller concern —
 * pass this only when `authorizationToken` is registered.
 */
export function createNativeBusinessAccessChecker(
  authz: AppAuthorization,
): BusinessAccessChecker {
  return async (request) => {
    if (!request.permissionRef) return false;
    const parsed = parsePermissionRef(request.permissionRef);
    if (!parsed) return false;
    const principal = { type: 'user' as const, id: request.userId };
    const subjects = [
      { type: 'authenticated' as const, id: '*' },
      ...(await authz.subjects.resolveFor(principal)),
    ];
    return authz.for({ principal, subjects }).can({
      resource: {
        type: parsed.resourceType,
        id: request.recordId ?? '*',
      },
      action: parsed.action,
    });
  };
}

/**
 * Test/harness checker: allows when `permissionRef` is set and the user id is listed
 * for that ref in the allow map. Used only by tests to prove the three authorization states.
 */
export function createAllowlistAccessChecker(
  grants: ReadonlyMap<string, ReadonlySet<string>>,
): BusinessAccessChecker {
  return async (request) => {
    if (!request.permissionRef) return false;
    const users = grants.get(request.permissionRef);
    return Boolean(users?.has(request.userId));
  };
}
