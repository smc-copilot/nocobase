import {
  createSecretsTableStore,
  type SecretsStore,
} from '@nocobase/app-server/secrets';
import type { DatabaseConnection } from '@nocobase/db';
import { OA_SECRET_PURPOSE } from '../resources.js';

export function oaSettingsAad(row: {
  id?: unknown;
  credentialVersion?: unknown;
}): string[] {
  return [
    typeof row.id === 'string' ? row.id : 'default',
    typeof row.credentialVersion === 'number'
      ? String(row.credentialVersion)
      : '0',
  ];
}

export function createMeetingOaSecretsStores(
  connection: () => DatabaseConnection,
): SecretsStore[] {
  return [
    createSecretsTableStore({
      name: '@nocobase/app-meeting/oa-settings',
      table: 'meetingOaSettings',
      columns: [
        {
          column: 'sealedClientSecret',
          purpose: OA_SECRET_PURPOSE,
          aad: oaSettingsAad,
        },
      ],
      select: ['credentialVersion'],
      connection,
    }),
  ];
}
