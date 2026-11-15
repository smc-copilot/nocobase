import NotificationManagementProvider from './notification-management.js';
import MeetingGatewayProvider from './meeting-gateway.js';
import MeetingOaProvider from './meeting-oa.js';
import MeetingsAuthorizationProvider from './meetings-authorization.js';
import SubmissionProvider from './submission.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  NotificationManagementProvider,
  MeetingsAuthorizationProvider,
  MeetingGatewayProvider,
  MeetingOaProvider,
];

export default serviceProviders;
