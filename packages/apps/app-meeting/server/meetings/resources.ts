import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';

export const MEETINGS = 'meetings';
export const MEETING_ACCESS = 'meetingAccess';

export const MEETING_RESOURCE = 'meeting';
export const MEETING_GRANTED_ACCESS = 'meeting.granted';
export const MEETINGS_PAGE = 'meetings';

export interface Meeting {
  id: string;
  title: string | null;
  meetingCode: string | null;
  sourceGatewayInstance: string;
  sourceOrganization: string;
  sourceConnectionRef: string;
  sourceUpstreamMeetingId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingAccess {
  id: string;
  meetingId: string;
  userId: string;
  canRead: boolean;
  canWrite: boolean;
}

export const meetingPublicFields = [
  'id',
  'title',
  'meetingCode',
  'createdAt',
] as const;

export const meetingGrantedAccess = defineRecordAccess(
  MEETING_GRANTED_ACCESS,
  (access) =>
    access
      .title('Meetings granted to me')
      .collections(MEETINGS)
      .resolver(() => false),
);

const meetingData = defineDatabasePermission((permission) =>
  permission
    .collection<Meeting>(MEETINGS)
    .read([...meetingPublicFields])
    .options(meetingGrantedAccess.reference()),
);

export const meetingResource = defineCompositeResource(MEETING_RESOURCE, (r) =>
  r
    .title('Meetings')
    .action('read', (action) =>
      action.title('Read meetings').grant('meetings', meetingData),
    ),
);
