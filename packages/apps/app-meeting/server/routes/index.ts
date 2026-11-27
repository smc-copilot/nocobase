import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { meetingGatewayRoutes } from './meeting-gateway.js';
import { meetingOaRoutes } from './meeting-oa.js';
import { meetingOaSsoRoutes } from './meeting-oa-sso.js';
import { meetingQueryRunRoutes } from './meeting-query-runs.js';
import { meetingsRoutes } from './meetings.js';

const routes: readonly AppRouteContribution<Application>[] = [
  meetingGatewayRoutes,
  meetingQueryRunRoutes,
  meetingsRoutes,
  meetingOaRoutes,
  meetingOaSsoRoutes,
];

export default routes;
