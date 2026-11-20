import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { EnterprisePortalAuthorizationProvider } from '../../server/authorization.js';
import {
  PORTAL_SETTINGS_SECTION,
  SETTINGS_AUDIT,
  SETTINGS_CATALOG,
} from '../../server/config.js';

describe('portal authz.settings registration', () => {
  it('registers catalog and audit settings under administration', async () => {
    const authz = createAppAuthorization({});
    const container = new ServiceContainer();
    container.instance(authorizationToken, authz);
    await new EnterprisePortalAuthorizationProvider({
      container,
    } as AppPluginApplication).boot();
    expect(authz.ui.sections.get(PORTAL_SETTINGS_SECTION)).toMatchObject({
      parent: 'administration',
    });
    expect(
      authz.resourceTypes
        .get('settings')
        .items?.get(SETTINGS_CATALOG)
        ?.actions.map((entry) => entry.name),
    ).toEqual(['read', 'configure']);
    expect(
      authz.resourceTypes
        .get('settings')
        .items?.get(SETTINGS_AUDIT)
        ?.actions.map((entry) => entry.name),
    ).toEqual(['read']);
  });
});
