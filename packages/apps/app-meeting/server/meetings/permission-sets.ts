import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  MEETING_CONNECTIONS_PAGE,
  MEETING_GRANTED_ACCESS,
  MEETING_OWN_BINDINGS_ACCESS,
  MEETING_OWN_QUERY_RUNS_ACCESS,
  MEETINGS_PAGE,
  meetingResource,
} from './resources.js';

export const meetingOperatorPermissionSet = definePermissionSet(
  'meeting-operator',
)
  .title('Meeting operator')
  .grant({
    resource: { type: 'page', id: MEETINGS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant({
    resource: { type: 'page', id: MEETING_CONNECTIONS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    meetingResource.reference().grant({
      read: { meetings: MEETING_GRANTED_ACCESS },
      manageConnections: {
        meetingGatewayBindings: MEETING_OWN_BINDINGS_ACCESS,
      },
      query: { meetingQueryRuns: MEETING_OWN_QUERY_RUNS_ACCESS },
    }),
  )
  .build();
