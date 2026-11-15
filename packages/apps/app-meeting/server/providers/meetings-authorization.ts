import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';
import {
  MEETING_ACCESS,
  MEETINGS,
  meetingGrantedAccess,
  meetingResource,
  type MeetingAccess,
} from '../meetings/resources.js';

export default class MeetingsAuthorizationProvider extends ServiceProvider<Application> {
  readonly name = 'app/meetings-authorization';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({
      name: MEETINGS,
      title: 'Meetings',
    });
    authz.database.collections.add({
      name: MEETING_ACCESS,
      title: 'Meeting access',
    });
    authz.recordAccess.define(
      meetingGrantedAccess.resolver(async ({ collection, principal }) => {
        if (
          collection !== MEETINGS ||
          principal.type !== 'user' ||
          !this.app.container.has(databaseManagerToken)
        )
          return false;
        const grants = await this.app.container
          .resolve(databaseManagerToken)
          .repository<MeetingAccess>(MEETING_ACCESS)
          .findMany({
            filter: buildFilter((filter) =>
              filter.and([
                filter.string('userId').eq(principal.id),
                filter.boolean('canRead').isTrue(),
              ]),
            ),
            select: (select) => select.fields('meetingId'),
          });
        if (!grants.length) return false;
        return buildFilter((filter) =>
          filter.or(grants.map((row) => filter.string('id').eq(row.meetingId))),
        );
      }),
    );
    authz.ui.sections.add({
      name: 'meetings',
      title: 'Meetings',
      parent: 'business',
    });
    authz.ui.place(authz.compositeResources.define(meetingResource.build()), {
      section: 'meetings',
    });
  }
}
