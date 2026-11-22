import type { DatabaseManager } from '@nocobase/db';

import type { EnterpriseAppPortalConfig } from '../config.js';
import type { DnsLookup } from './url-guard.js';
import { AccessAuditLog } from './access-audit.js';
import { AgentGrantOperationStore } from './agent-grant-operations.js';
import { AgentGrantsReadService } from './agent-grants-read.js';
import { AgentGrantsService, octopGuardOptionsFrom } from './agent-grants.js';
import { ApplicationCatalogService } from './application-catalog.js';
import { ApplicationLaunchService } from './application-launch.js';
import { CasdoorApplicationAccessAdapter } from './casdoor-application-access.js';
import { CasdoorApplicationGrants } from './casdoor-application-grants.js';
import { createCasdoorClientSource } from './casdoor-management-client.js';
import { HealthProbeService } from './health-probe.js';
import {
  DEFAULT_OCTOP_API_TIMEOUT_MS,
  OctopManagementClient,
} from './octop-management-client.js';
import { resolveOctopInstance } from './octop-instance-config.js';
import { UserPreferenceService } from './user-preferences.js';

export interface EnterprisePortalServices {
  readonly catalog: ApplicationCatalogService;
  readonly access: CasdoorApplicationAccessAdapter;
  readonly launch: ApplicationLaunchService;
  readonly preferences: UserPreferenceService;
  readonly health: HealthProbeService;
  readonly audit: AccessAuditLog;
  readonly grants: CasdoorApplicationGrants;
  readonly agentGrants: AgentGrantsService;
  readonly agentGrantOps: AgentGrantOperationStore;
  readonly agentGrantsRead: AgentGrantsReadService;
}

export function createEnterprisePortalServices(
  database: () => DatabaseManager,
  config: () => EnterpriseAppPortalConfig,
  options: {
    readonly lookup?: DnsLookup;
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => Date;
    readonly env?: Readonly<Record<string, string | undefined>>;
  } = {},
): EnterprisePortalServices {
  const audit = new AccessAuditLog(database);
  const launchUrlOptions = () => ({
    allowHttp: config().launchAllowHttp === true,
    allowPrivateDns: config().launchAllowPrivateDns === true,
  });
  const octopGuard = () => octopGuardOptionsFrom(config());
  const octopAllowlist = () => config().octopApiHostAllowlist ?? [];
  const catalog = new ApplicationCatalogService(
    database,
    () => config().launchHostAllowlist ?? [],
    audit,
    options.lookup,
    launchUrlOptions,
    octopAllowlist,
    octopGuard,
  );
  const env = () => options.env ?? process.env;
  const casdoor = createCasdoorClientSource(
    () => config().access ?? {},
    env,
    options.fetchImpl ?? fetch,
  );
  const access = new CasdoorApplicationAccessAdapter(
    () => config().access ?? {},
    options.now,
    {
      client: () => casdoor.client(),
      targets: async () =>
        (await catalog.list()).map((record) => ({
          appCode: record.appCode,
          casdoorAppKey: record.casdoorAppKey,
        })),
    },
  );
  const grants = new CasdoorApplicationGrants(
    () => casdoor.client(),
    () => {
      access.clearCache();
    },
  );
  const health = new HealthProbeService(
    () => config().health ?? {},
    options.fetchImpl,
    options.now,
  );
  const preferences = new UserPreferenceService(database);
  const launch = new ApplicationLaunchService(
    catalog,
    access,
    health,
    preferences,
    audit,
    () => config().launchHostAllowlist ?? [],
    options.lookup,
    launchUrlOptions,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const openOctop = async (app: Parameters<typeof resolveOctopInstance>[0]) => {
    const resolved = await resolveOctopInstance(app, env(), octopAllowlist(), {
      ...octopGuard(),
      lookup: options.lookup,
    });
    return new OctopManagementClient(
      resolved.baseUrl,
      resolved.auth,
      fetchImpl,
      DEFAULT_OCTOP_API_TIMEOUT_MS,
    );
  };
  const agentGrantOps = new AgentGrantOperationStore(database);
  const agentGrantsRead = new AgentGrantsReadService(
    catalog,
    grants,
    openOctop,
  );
  const agentGrants = new AgentGrantsService(
    catalog,
    grants,
    agentGrantsRead,
    agentGrantOps,
    audit,
    openOctop,
    octopGuard,
    octopAllowlist,
  );
  return {
    catalog,
    access,
    launch,
    preferences,
    health,
    audit,
    grants,
    agentGrants,
    agentGrantOps,
    agentGrantsRead,
  };
}
