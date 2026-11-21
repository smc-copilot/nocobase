import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { meetingOperatorPermissionSet } from '../../../server/meetings/permission-sets.js';

export default defineSeed({
  name: '202611180002_meeting_view_recording_grants',
  transaction: true,
  async run(task) {
    const now = new Date();
    const existing = await task
      .repository('authorizationPermissionSets')
      .findOne({ filter: { key: meetingOperatorPermissionSet.key } });
    const values = {
      title: encodeAuthorizationTitle(meetingOperatorPermissionSet.title),
      grants: JSON.stringify(meetingOperatorPermissionSet.grants),
      updatedAt: now,
    };
    if (existing) {
      await task.query
        .updateTable('authorizationPermissionSets')
        .set(values)
        .where('key', '=', meetingOperatorPermissionSet.key)
        .execute();
      return;
    }
    await task.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: meetingOperatorPermissionSet.key,
        key: meetingOperatorPermissionSet.key,
        createdAt: now,
        ...values,
      })
      .execute();
  },
});
