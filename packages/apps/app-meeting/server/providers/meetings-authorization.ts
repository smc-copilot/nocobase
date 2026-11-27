import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { buildFilter } from '@nocobase/repository-input';
import {
  MEETING_ACCESS,
  MEETING_GATEWAY_BINDINGS,
  MEETING_QUERY_RUNS,
  MEETINGS,
  meetingGrantedAccess,
  meetingOwnBindingsAccess,
  meetingOwnQueryRunsAccess,
  meetingResource,
  type MeetingAccess,
  type MeetingGatewayBinding,
  type MeetingQueryRun,
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
    authz.database.collections.add({
      name: MEETING_GATEWAY_BINDINGS,
      title: 'Meeting gateway bindings',
    });
    authz.database.collections.add({
      name: MEETING_QUERY_RUNS,
      title: 'Meeting query runs',
    });
    for (const [name, title] of [
      ['meetingContents', 'Meeting contents'],
      ['meetingImportRuns', 'Meeting import runs'],
      ['meetingOaSettings', 'Meeting OA settings'],
      ['meetingOaEmployeeMaps', 'Meeting OA employee maps'],
      ['meetingOaDelegations', 'Meeting OA delegations'],
      ['meetingOaDrafts', 'Meeting OA drafts'],
      ['meetingOaDraftTasks', 'Meeting OA draft tasks'],
      ['meetingOaOperations', 'Meeting OA operations'],
      ['meetingOaSteps', 'Meeting OA steps'],
      ['meetingOaTaskResults', 'Meeting OA task results'],
      ['meetingOaOutbox', 'Meeting OA outbox'],
      ['meetingOaReconcileRecords', 'Meeting OA reconcile records'],
      ['meetingAuditEvents', 'Meeting audit events'],
    ] as const) {
      authz.database.collections.add({ name, title });
    }
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
    authz.recordAccess.define(
      meetingOwnBindingsAccess.resolver(async ({ collection, principal }) => {
        if (
          collection !== MEETING_GATEWAY_BINDINGS ||
          principal.type !== 'user' ||
          !this.app.container.has(databaseManagerToken)
        )
          return false;
        const rows = await this.app.container
          .resolve(databaseManagerToken)
          .repository<MeetingGatewayBinding>(MEETING_GATEWAY_BINDINGS)
          .findMany({
            filter: { userId: principal.id },
            select: (select) => select.fields('id'),
          });
        if (!rows.length) return false;
        return buildFilter((filter) =>
          filter.or(rows.map((row) => filter.string('id').eq(row.id))),
        );
      }),
    );
    authz.recordAccess.define(
      meetingOwnQueryRunsAccess.resolver(async ({ collection, principal }) => {
        if (
          collection !== MEETING_QUERY_RUNS ||
          principal.type !== 'user' ||
          !this.app.container.has(databaseManagerToken)
        )
          return false;
        const rows = await this.app.container
          .resolve(databaseManagerToken)
          .repository<MeetingQueryRun>(MEETING_QUERY_RUNS)
          .findMany({
            filter: { userId: principal.id },
            select: (select) => select.fields('id'),
          });
        if (!rows.length) return false;
        return buildFilter((filter) =>
          filter.or(rows.map((row) => filter.string('id').eq(row.id))),
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
