import { createServiceToken } from '@nocobase/service-provider';
import type { MeetingOaAdapter } from './adapter.js';

export const meetingOaAdapterToken = createServiceToken<MeetingOaAdapter>(
  'app-meeting/oa-adapter',
);
