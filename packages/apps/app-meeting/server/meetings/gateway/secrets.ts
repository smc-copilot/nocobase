import {
  createSecretsTableStore,
  type SecretsStore,
} from '@nocobase/app-server/secrets';
import type { DatabaseConnection } from '@nocobase/db';
import { GATEWAY_SECRET_PURPOSE } from '../resources.js';

export function createMeetingGatewaySecretsStores(
  connection: () => DatabaseConnection,
): SecretsStore[] {
  const aad = (row: Record<string, unknown>) => {
    const version = row.credentialVersion;
    return [
      typeof row.id === 'string' || typeof row.id === 'number'
        ? String(row.id)
        : '',
      typeof row.userId === 'string' || typeof row.userId === 'number'
        ? String(row.userId)
        : '',
      typeof version === 'string' || typeof version === 'number'
        ? String(version)
        : '0',
    ];
  };
  return [
    createSecretsTableStore({
      name: '@nocobase/app-meeting/gateway-bindings',
      table: 'meetingGatewayBindings',
      columns: [
        {
          column: 'sealedAccessToken',
          purpose: GATEWAY_SECRET_PURPOSE,
          aad,
        },
        {
          column: 'sealedRefreshToken',
          purpose: GATEWAY_SECRET_PURPOSE,
          aad,
        },
      ],
      select: ['userId', 'credentialVersion'],
      connection,
    }),
    createSecretsTableStore({
      name: '@nocobase/app-meeting/oauth-states',
      table: 'meetingOauthStates',
      columns: [
        {
          column: 'sealedAccessToken',
          purpose: GATEWAY_SECRET_PURPOSE,
          aad: (row) => [String(row.id), String(row.userId), 'oauth'],
        },
      ],
      select: ['userId'],
      connection,
    }),
  ];
}

export function gatewayBindingAad(row: {
  id: string;
  userId: string;
  credentialVersion: number;
}): readonly string[] {
  return [row.id, row.userId, String(row.credentialVersion)];
}

export function oauthStateAad(row: {
  id: string;
  userId: string;
}): readonly string[] {
  return [row.id, row.userId, 'oauth'];
}
