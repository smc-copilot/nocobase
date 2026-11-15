import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { meetingsRoutes } from './meetings.js';

const routes: readonly AppRouteContribution<Application>[] = [meetingsRoutes];

export default routes;
