/**
 * Maps Authorization Permission Set keys to ReleasesPermissions. Kept free of provider
 * imports so unit tests do not load the authorization plugin graph.
 */
import {
  allPermissions,
  noPermissions,
  type AppAction,
  type BusinessKey,
  type ReleasesPermissions,
  type Scope,
} from '@nocobase/app-plugin-releases/shared/access';

/** Permission Sets whose holders reach every App, at every action. */
export const UNRESTRICTED_SETS: readonly string[] = ['root', 'platform-admin'];

/** The Permission Set of someone who ships their own Apps. */
export const PUBLISHER_SET = 'publisher';

/**
 * What a publisher may do on the Apps related to them — the ones they created, since nothing here widens "related".
 * Creating an App offers no related level, so it is held outright; `deploy-protected` and `delete` are not.
 */
const PUBLISHER_ACTIONS: readonly AppAction[] = [
  'view',
  'read-logs',
  'configure',
  'upload',
  'deploy',
  'operate',
];

export function permissionsForSets(
  sets: readonly string[],
  userId: string,
): ReleasesPermissions {
  if (sets.some((key) => UNRESTRICTED_SETS.includes(key)))
    return allPermissions();

  const base = noPermissions();
  if (!sets.includes(PUBLISHER_SET)) return base;

  const scopes: Record<BusinessKey, Scope> = { ...base.scopes };
  for (const action of PUBLISHER_ACTIONS)
    scopes[`rel.apps/${action}`] = { users: [userId] };
  scopes['rel.apps/create'] = 'all';

  return {
    scopes,
    settings: { ...base.settings, 'rel.environments/read': true },
    pages: { ...base.pages, 'rel-apps': true },
  };
}
