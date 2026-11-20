import type { DatabaseManager } from '@nocobase/db';

import type { EnterpriseAppPortalConfig } from '../config.js';
import type { DnsLookup } from './url-guard.js';
import { AccessAuditLog } from './access-audit.js';
import { ApplicationCatalogService } from './application-catalog.js';
import { ApplicationLaunchService } from './application-launch.js';
import { CasdoorApplicationAccessAdapter } from './casdoor-application-access.js';
import { HealthProbeService } from './health-probe.js';
import { UserPreferenceService } from './user-preferences.js';

export interface EnterprisePortalServices {
  readonly catalog: ApplicationCatalogService;
  readonly access: CasdoorApplicationAccessAdapter;
  readonly launch: ApplicationLaunchService;
  readonly preferences: UserPreferenceService;
  readonly health: HealthProbeService;
  readonly audit: AccessAuditLog;
}

export function createEnterprisePortalServices(
  database: () => DatabaseManager,
  config: () => EnterpriseAppPortalConfig,
  options: {
    readonly lookup?: DnsLookup;
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => Date;
  } = {},
): EnterprisePortalServices {
  const audit = new AccessAuditLog(database);
  const catalog = new ApplicationCatalogService(
    database,
    () => config().launchHostAllowlist ?? [],
    audit,
    options.lookup,
  );
  const access = new CasdoorApplicationAccessAdapter(
    () => config().access ?? {},
    options.now,
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
  );
  return { catalog, access, launch, preferences, health, audit };
}
