import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import {
  MEETING_GRANTED_ACCESS,
  meetingResource,
} from '../../../server/meetings/resources.js';

const meetingOperator = definePermissionSet('meeting-operator')
  .title('Meeting operator')
  .grant({
    resource: { type: 'page', id: 'meetings' },
    actions: [{ action: 'access' }],
  })
  .grant(
    meetingResource.reference().grant({
      read: { meetings: MEETING_GRANTED_ACCESS },
    }),
  )
  .build();

const accountsManager = definePermissionSet('accounts-manager')
  .title('Accounts manager')
  .grant({
    resource: { type: 'user', id: '*' },
    actions: [{ action: 'read' }],
  })
  .grant({
    resource: {
      type: 'settings',
      id: 'authorization.permission-sets',
    },
    actions: [{ action: 'read' }],
  })
  .build();

export default defineSeed({
  name: '202611150001_meeting_permission_sets',
  transaction: true,
  async run(task) {
    const now = new Date();
    for (const definition of [meetingOperator, accountsManager]) {
      if (
        await task.repository('authorizationPermissionSets').exists({
          filter: { key: definition.key },
        })
      ) {
        continue;
      }
      await task.query
        .insertInto('authorizationPermissionSets')
        .values({
          id: definition.key,
          key: definition.key,
          title: encodeAuthorizationTitle(definition.title),
          grants: JSON.stringify(definition.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
