import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import {
  meetingOaOperatorPermissionSet,
  meetingOaReconcilerPermissionSet,
  meetingOperatorPermissionSet,
} from '../../../server/meetings/permission-sets.js';

export default defineSeed({
  name: '202611150003_meeting_oa_grants',
  transaction: true,
  async run(task) {
    const now = new Date();
    for (const definition of [
      meetingOperatorPermissionSet,
      meetingOaOperatorPermissionSet,
      meetingOaReconcilerPermissionSet,
    ]) {
      const existing = await task
        .repository('authorizationPermissionSets')
        .findOne({ filter: { key: definition.key } });
      const values = {
        title: encodeAuthorizationTitle(definition.title),
        grants: JSON.stringify(definition.grants),
        updatedAt: now,
      };
      if (existing) {
        await task.query
          .updateTable('authorizationPermissionSets')
          .set(values)
          .where('key', '=', definition.key)
          .execute();
        continue;
      }
      await task.query
        .insertInto('authorizationPermissionSets')
        .values({
          id: definition.key,
          key: definition.key,
          createdAt: now,
          ...values,
        })
        .execute();
    }
  },
});
