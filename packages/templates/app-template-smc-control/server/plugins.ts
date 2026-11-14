import concurrency from '@nocobase/app-plugin-concurrency/server';
import foundation from '@nocobase/app-plugin-foundation/server';
import defaultAccess from '@nocobase/app-plugin-authz-default-access/server';
import sharingRules from '@nocobase/app-plugin-authz-sharing-rules/server';
import restrictionRules from '@nocobase/app-plugin-authz-restriction-rules/server';
import agentAuthorization from '@nocobase/app-plugin-agent-authorization/server';
import apiKeys from '@nocobase/app-plugin-api-keys/server';
import authentication from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
import databaseExplorer from '@nocobase/app-plugin-database-explorer/server';
import users from '@nocobase/app-plugin-users/server';
import i18n from '@nocobase/app-plugin-i18n/server';
import notification from '@nocobase/app-plugin-notification/server';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';
import scheduler from '@nocobase/app-plugin-scheduler/server';
import file from '@nocobase/app-plugin-file/server';
import mail from '@nocobase/app-plugin-mail/server';
import releases from '@nocobase/app-plugin-releases/server';
import casdoorIdentity from '@nocobase/app-plugin-casdoor-identity/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  concurrency,
  authentication,
  authorization,
  defaultAccess,
  sharingRules,
  restrictionRules,
  databaseExplorer,
  users,
  apiKeys,
  // OAuth2 authorization server for external agent clients. Control operators
  // manage clients, grants, and audit from System settings.
  agentAuthorization,
  i18n,
  notification,
  notificationInApp,
  notificationProviders,
  file,
  scheduler,
  mail,
  // Control owns identity for its own operators; Business UI Adapter stays on Demo Apps.
  casdoorIdentity,
  // Release management reads the caller's roles through `releasesAccessToken`, which
  // `server/providers/releases-access.ts` binds from the authorization plugin, so it is
  // contributed after authentication and authorization.
  releases,
  foundation,
]);

export default serverPlugins;
