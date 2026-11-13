/**
 * Who may do what in release management. The plugin declares what can be granted and leaves the roles to the
 * application (`releasesAccessToken`); unbound, every caller holds nothing. This binds it to the Permission Sets the
 * authorization plugin keeps, so Control's roles are administered in one place.
 *
 * | Permission Set             | What it holds                                                                  |
 * | -------------------------- | ------------------------------------------------------------------------------ |
 * | `root`, `platform-admin`   | everything, on every App                                                        |
 * | `publisher`                | the Apps related to them, plus creating Apps and reading the environments       |
 * | anything else              | nothing                                                                         |
 *
 * `docs/releases-access.md` describes the sets and how an installation creates them.
 */
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  releasesAccessToken,
  type ReleasesAccess,
} from '@nocobase/app-plugin-releases/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import type {
  AuthorizationIdentity,
  AuthorizationSubject,
} from '@nocobase/authorization/core';
import { ServiceProvider } from '@nocobase/service-provider';

import { permissionsForSets } from '../lib/releases-permissions.js';

export {
  PUBLISHER_SET,
  UNRESTRICTED_SETS,
  permissionsForSets,
} from '../lib/releases-permissions.js';

export default class ReleasesAccessProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/releases-access';

  public override register(): void {
    this.app.container.singleton(releasesAccessToken, () => {
      const access: ReleasesAccess = {
        permissionsOf: async (identity) =>
          permissionsForSets(
            await this.setsOf(identity),
            identity.principal.id,
          ),
        permissionsOfUser: async (userId) =>
          permissionsForSets(
            await this.setsOf({ principal: { type: 'user', id: userId } }),
            userId,
          ),
        // An agent acting for someone carries the `agent` subject; the plugin then refuses it the actions only a
        // person may perform, whatever its sets hold.
        actorKindOf: (identity) =>
          identity.subjects?.some(
            (subject: AuthorizationSubject) => subject.type === 'agent',
          )
            ? 'agent'
            : 'human',
      };
      return access;
    });
  }

  private async setsOf(
    identity: AuthorizationIdentity,
  ): Promise<readonly string[]> {
    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    const sets = await authz.permissionSets.getEffective({
      principal: identity.principal,
      ...(identity.subjects ? { subjects: identity.subjects } : {}),
    });
    return sets.map((set: { key: string }) => set.key);
  }
}
