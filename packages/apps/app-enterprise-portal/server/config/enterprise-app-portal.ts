import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { EnterpriseAppPortalConfig } from '@superice/app-plugin-enterprise-app-portal/server';

/**
 * Isolation default: `contractFixture` so local screenshots can show authorized
 * cards without a live Casdoor. Production must set `access.source` to a proven
 * Casdoor contract or leave it `unconfigured` (fail closed).
 */
const enterpriseAppPortal: AppConfigFactory<EnterpriseAppPortalConfig> =
  defineAppConfig({
    defaults: () => ({
      launchHostAllowlist: ['example.com'],
      access: {
        source: 'contractFixture',
        fixtureGrants: [
          { username: 'nocobase', appCodes: ['octop', 'weknora'] },
        ],
      },
    }),
  });

export default enterpriseAppPortal;
