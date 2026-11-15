import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { meetingGatewayRoutes } from './meeting-gateway.js';
import { meetingQueryRunRoutes } from './meeting-query-runs.js';
import { meetingsRoutes } from './meetings.js';

const routes: readonly AppRouteContribution<Application>[] = [
  meetingGatewayRoutes,
  meetingQueryRunRoutes,
  meetingsRoutes,
];

export default routes;
