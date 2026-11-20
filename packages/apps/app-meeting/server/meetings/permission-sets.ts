import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  MEETING_CONNECTIONS_PAGE,
  MEETING_GRANTED_ACCESS,
  MEETING_INTEGRATIONS_PAGE,
  MEETING_OPERATIONS_PAGE,
  MEETING_OWN_BINDINGS_ACCESS,
  MEETING_OWN_QUERY_RUNS_ACCESS,
  MEETING_RECONCILIATION_PAGE,
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
      viewRecording: {},
      manageConnections: {
        meetingGatewayBindings: MEETING_OWN_BINDINGS_ACCESS,
      },
      query: { meetingQueryRuns: MEETING_OWN_QUERY_RUNS_ACCESS },
      import: {},
      edit: {},
      oaDraftEdit: {},
      supplement: {},
    }),
  )
  .build();

export const meetingOaOperatorPermissionSet = definePermissionSet(
  'meeting-oa-operator',
)
  .title('Meeting OA operator')
  .grant({
    resource: { type: 'page', id: MEETINGS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant({
    resource: { type: 'page', id: MEETING_INTEGRATIONS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant({
    resource: { type: 'page', id: MEETING_OPERATIONS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    meetingResource.reference().grant({
      read: { meetings: MEETING_GRANTED_ACCESS },
      oaSync: {},
      oaResume: {},
      identityManage: {},
    }),
  )
  .build();

export const meetingOaReconcilerPermissionSet = definePermissionSet(
  'meeting-oa-reconciler',
)
  .title('Meeting OA reconciler')
  .grant({
    resource: { type: 'page', id: MEETING_RECONCILIATION_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant({
    resource: { type: 'page', id: MEETING_OPERATIONS_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    meetingResource.reference().grant({
      read: { meetings: MEETING_GRANTED_ACCESS },
      oaReconcile: {},
    }),
  )
  .build();
