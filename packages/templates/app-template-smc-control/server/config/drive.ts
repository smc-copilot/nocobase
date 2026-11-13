import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppDriveConfig } from '@nocobase/drive';

const drive: AppConfigFactory<AppDriveConfig> = defineAppConfig(({ paths }) => {
  const disks: AppDriveConfig['disks'] = {
    local: {
      driver: 'fs',
      location: paths.storage(),
      visibility: 'private',
    },
    // Release archives carry server code and configuration templates, so the disk `releases.artifact` names must be
    // private: the plugin refuses a public one at startup.
    artifacts: {
      driver: 'fs',
      location: paths.storage('artifacts'),
      visibility: 'private',
    },
    s3: {
      driver: 's3',
      bucket: '',
      region: 'us-east-1',
      forcePathStyle: false,
      supportsACL: true,
      credentials: {},
      visibility: 'private',
    },
  };
  return {
    default: 'local',
    disks,
  };
});

export default drive;
