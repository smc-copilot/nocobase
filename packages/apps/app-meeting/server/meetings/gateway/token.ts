import { createServiceToken } from '@nocobase/service-provider';
import type { MeetingGatewayAdapter } from './adapter.js';

export const meetingGatewayAdapterToken =
  createServiceToken<MeetingGatewayAdapter>('app-meeting/gateway-adapter');
