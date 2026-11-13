import NotificationManagementProvider from './notification-management.js';
import ReleasesAccessProvider from './releases-access.js';
import SubmissionProvider from './submission.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  NotificationManagementProvider,
  ReleasesAccessProvider,
];

export default serviceProviders;
