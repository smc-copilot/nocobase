import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Authorization } from '@nocobase/app-plugin-authorization';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
  generateApiDocument,
} from '@nocobase/app-server/router';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  SETTINGS_APPS,
  SETTINGS_AUDIT,
  SETTINGS_CONFLICTS,
  SETTINGS_IDENTITIES,
  SETTINGS_MEMBERSHIPS,
  SETTINGS_PERSONS,
  SETTINGS_PROVIDERS,
} from '../../server/authorization.js';
import { apiRoutes } from '../../server/routes/index.js';
import type {
  AppRegistryService,
  MembershipService,
} from '../../server/services/apps.js';
import type { IdentityAuditLog } from '../../server/services/audit.js';
import type { ConflictQueue } from '../../server/services/conflicts.js';
import type { IdentityLinkService } from '../../server/services/identities.js';
import type { PersonService } from '../../server/services/persons.js';
import type { ProviderRegistry } from '../../server/services/providers.js';
import {
  appRegistryServiceToken,
  conflictQueueToken,
  identityAuditLogToken,
  identityLinkServiceToken,
  membershipServiceToken,
  personServiceToken,
  providerRegistryToken,
} from '../../server/tokens.js';

const settingsIds = [
  SETTINGS_PERSONS,
  SETTINGS_PROVIDERS,
  SETTINGS_IDENTITIES,
  SETTINGS_APPS,
  SETTINGS_MEMBERSHIPS,
  SETTINGS_AUDIT,
  SETTINGS_CONFLICTS,
];

describe('@nocobase/app-plugin-identity-hub routes', () => {
  it('denies anonymous requests', async () => {
    const { router } = await createRouter({
      authenticated: false,
      allowed: true,
    });
    expect((await router.request('/identityHub/persons')).status).toBe(401);
  });

  it('denies a signed-in caller who lacks the settings grant', async () => {
    const { router, can, createPerson } = await createRouter({
      authenticated: true,
      allowed: false,
    });
    const response = await router.request('/identityHub/persons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ada' }),
    });
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({
      status: 'PERMISSION_DENIED',
      reason: 'IDENTITY_HUB_MANAGE_REQUIRED',
      domain: 'identityHub',
    });
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'settings', id: SETTINGS_PERSONS },
      action: 'manage',
    });
    expect(createPerson).not.toHaveBeenCalled();
  });

  it('lets a reader list persons and refuses a write', async () => {
    const { router, createPerson } = await createRouter({
      authenticated: true,
      allowed: { [SETTINGS_PERSONS]: ['read'] },
    });
    expect((await router.request('/identityHub/persons')).status).toBe(200);
    const denied = await router.request('/identityHub/persons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ada' }),
    });
    expect(denied.status).toBe(403);
    expect(createPerson).not.toHaveBeenCalled();
  });

  it('declares every route and a document without schema problems', async () => {
    const { router } = await createRouter({
      authenticated: true,
      allowed: true,
    });
    expect(findUndeclaredApiRoutes(router)).toEqual([]);
    const document = await generateApiDocument(router, {
      info: { title: 'Identity Hub', version: '0.0.1' },
    });
    expect(findApiDocumentSchemaProblems(document)).toEqual([]);
    const operationIds = Object.values(document.paths ?? {}).flatMap((item) =>
      Object.values(item ?? {}).map(
        (operation) => (operation as { operationId?: string }).operationId,
      ),
    );
    expect(operationIds).toEqual(
      expect.arrayContaining([
        'identityHubListPersons',
        'identityHubCreatePerson',
        'identityHubGetPerson',
        'identityHubUpdatePerson',
        'identityHubDisablePerson',
        'identityHubEnablePerson',
        'identityHubArchivePerson',
        'identityHubListProviders',
        'identityHubCreateProvider',
        'identityHubUpdateProvider',
        'identityHubPreviewIdentityLink',
        'identityHubLinkIdentity',
        'identityHubUnlinkIdentity',
        'identityHubListApps',
        'identityHubCreateApp',
        'identityHubUpdateApp',
        'identityHubListMemberships',
        'identityHubGrantMembership',
        'identityHubRevokeMembership',
        'identityHubListAuditEvents',
        'identityHubListConflicts',
        'identityHubResolveConflict',
      ]),
    );
    for (const id of settingsIds) {
      expect(id.startsWith('identityHub.')).toBe(true);
    }
  });
});

async function errorOf(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json()) as { error: Record<string, unknown> }).error;
}

async function createRouter(options: {
  authenticated: boolean;
  allowed: boolean | Readonly<Record<string, readonly ('read' | 'manage')[]>>;
}) {
  const container = new ServiceContainer();
  const can = vi.fn(
    async (requirement: {
      resource: { type: string; id: string };
      action: string;
    }) => {
      if (options.allowed === true) return true;
      if (options.allowed === false) return false;
      return (
        options.allowed[requirement.resource.id]?.includes(
          requirement.action as 'read' | 'manage',
        ) ?? false
      );
    },
  );
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (!options.authenticated) {
        return context.json({ error: 'Authentication required.' }, 401);
      }
      context.set('auth', { user: { id: 'user-1' }, session: {} });
      await next();
    },
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', { can });
      await next();
    },
  } as unknown as Authorization);
  const createPerson = vi.fn(async () => ({ personId: 'person-1' }));
  const page = async () => ({ items: [], total: 0, page: 1, pageSize: 20 });
  container.instance(personServiceToken, {
    list: page,
    create: createPerson,
    get: async () => ({ personId: 'person-1' }),
    update: async () => ({ personId: 'person-1' }),
    disable: async () => ({ personId: 'person-1' }),
    enable: async () => ({ personId: 'person-1' }),
    archive: async () => ({ personId: 'person-1' }),
  } as unknown as PersonService);
  container.instance(providerRegistryToken, {
    list: page,
    create: async () => ({ providerId: 'manual' }),
    update: async () => ({ providerId: 'manual' }),
    get: async () => ({ providerId: 'manual' }),
  } as unknown as ProviderRegistry);
  container.instance(identityLinkServiceToken, {
    linkPreview: async () => ({
      identityKey: 'sub:ada',
      existingIdentity: null,
      suggestedPersonId: null,
      emailMatchIgnored: false,
    }),
    link: async () => ({ identityId: 'identity-1' }),
    unlink: async () => ({ identityId: 'identity-1' }),
  } as unknown as IdentityLinkService);
  container.instance(appRegistryServiceToken, {
    list: page,
    register: async () => ({ appId: 'portal' }),
    update: async () => ({ appId: 'portal' }),
    get: async () => ({ appId: 'portal' }),
  } as unknown as AppRegistryService);
  container.instance(membershipServiceToken, {
    list: page,
    grant: async () => ({ membershipId: 'membership-1' }),
    revoke: async () => ({ membershipId: 'membership-1' }),
  } as unknown as MembershipService);
  container.instance(identityAuditLogToken, {
    list: page,
  } as unknown as IdentityAuditLog);
  container.instance(conflictQueueToken, {
    list: page,
    resolve: async () => ({ conflictId: 'conflict-1' }),
  } as unknown as ConflictQueue);
  const router = await apiRoutes.createRouter({
    appName: 'test',
    publicBasePath: '',
    paths: {} as never,
    config: { app: { name: 'test', publicBasePath: '' } },
    router: new Hono(),
    container,
  } as AppPluginApplication);
  return { router, can, createPerson };
}
