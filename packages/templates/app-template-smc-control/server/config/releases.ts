import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { ReleasesPluginConfig } from '@nocobase/app-plugin-releases/server';

/**
 * Release management's own section. Archives go to the private `artifacts` disk of `drive.disks`; the plugin's
 * deployment logs and the configuration each deployment applied go under `dataDir`. The in-process App Host is off
 * here: an installation that runs Apps on this machine turns it on in `config.yml`, which is also where the Docker
 * Host is enabled.
 */
const releases: AppConfigFactory<ReleasesPluginConfig> = defineAppConfig(
  ({ paths }) => ({
    artifact: { disk: 'artifacts', prefix: 'releases' },
    dataDir: paths.storage('releases'),
    host: {
      enabled: false,
      appRevisionsDir: paths.storage('host/revisions'),
      appVolumesDir: paths.storage('host/volumes'),
      configPath: paths.storage('host/config.yml'),
    },
  }),
);

export default releases;
