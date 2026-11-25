import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import PortalAgentUsersPage from '../../client/pages/settings/portal-agent-users.js';
import {
  agentGrantUsersPath,
  filterAgentGrantUsers,
  formatDepartments,
  type AgentGrantUser,
} from '../../client/pages/settings/portal-agent-users-model.js';

const copy = enUS.settings;

const alice: AgentGrantUser = {
  id: 'org/alice',
  appCode: 'octop-a',
  appName: 'Octop A',
  name: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  groups: ['smartcore/JP_Dept'],
  accountExists: false,
  octopUserId: null,
  disabled: false,
  syncedAt: null,
  experts: [],
};

const bob: AgentGrantUser = {
  id: 'org/bob',
  appCode: 'octop-b',
  appName: 'Octop B',
  name: 'bob',
  displayName: 'Bob',
  email: 'bob@example.com',
  groups: ['smartcore/HR'],
  accountExists: true,
  octopUserId: '22',
  disabled: false,
  syncedAt: '2026-11-21T08:00:00.000Z',
  experts: [
    {
      agentId: 'agt-1',
      publishedExpertId: 'tpl-9',
      name: 'Helper',
      state: 'running',
      bootstrapPending: false,
    },
  ],
};

describe('agent grant user filters', () => {
  it('strips the Casdoor owner prefix and filters instance, department, sync and search', () => {
    expect(formatDepartments(['smartcore/JP_Dept', 'HR'])).toBe('JP_Dept, HR');
    expect(formatDepartments(undefined)).toBe('—');
    expect(formatDepartments([])).toBe('—');
    const rows = [alice, bob];
    expect(
      filterAgentGrantUsers(rows, {
        appCode: 'octop-a',
        department: '__all__',
        sync: 'all',
        query: '',
      }).map((row) => row.id),
    ).toEqual(['org/alice']);
    expect(
      filterAgentGrantUsers(rows, {
        appCode: '__all__',
        department: 'smartcore/HR',
        sync: 'all',
        query: '',
      }).map((row) => row.displayName),
    ).toEqual(['Bob']);
    expect(
      filterAgentGrantUsers(rows, {
        appCode: '__all__',
        department: '__all__',
        sync: 'unsynced',
        query: 'alice',
      }).map((row) => row.name),
    ).toEqual(['alice']);
    expect(
      filterAgentGrantUsers(rows, {
        appCode: '__all__',
        department: '__all__',
        sync: 'synced',
        query: 'alice',
      }),
    ).toEqual([]);
  });
});

describe('agent user management page', () => {
  it('lists aggregated rows, filters them, and submits the shared install body', async () => {
    const user = userEvent.setup();
    const calls: { method: string; path: string; json?: unknown }[] = [];
    await renderWithApp(<PortalAgentUsersPage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(async ({ method, path, json }) => {
        calls.push({ method, path, json });
        if (path === 'authorization/permissions') {
          return { data: { unrestricted: true, permissions: [] } };
        }
        if (path === agentGrantUsersPath()) {
          return {
            data: [
              {
                appCode: alice.appCode,
                appName: alice.appName,
                casdoorUserId: alice.id,
                username: alice.name,
                displayName: alice.displayName,
                email: alice.email,
                groups: alice.groups,
                accountExists: false,
                octopUserId: null,
                disabled: false,
                syncedAt: null,
                experts: [],
              },
              {
                appCode: bob.appCode,
                appName: bob.appName,
                casdoorUserId: bob.id,
                username: bob.name,
                displayName: bob.displayName,
                email: bob.email,
                groups: bob.groups,
                accountExists: true,
                octopUserId: bob.octopUserId,
                disabled: false,
                syncedAt: bob.syncedAt,
                experts: bob.experts,
              },
            ],
          };
        }
        if (path === 'enterpriseAppPortal/agentGrants/applications') {
          return {
            data: [
              {
                appCode: 'octop-a',
                name: 'Octop A',
                appType: 'octop',
                casdoorAppKey: 'OctopA',
                agentGrantsEnabled: true,
                apiBaseUrlConfigured: true,
                apiAuthMode: 'bearer_env',
              },
              {
                appCode: 'octop-b',
                name: 'Octop B',
                appType: 'octop',
                casdoorAppKey: 'OctopB',
                agentGrantsEnabled: true,
                apiBaseUrlConfigured: true,
                apiAuthMode: 'bearer_env',
              },
              {
                appCode: 'octop-off',
                name: 'Octop Off',
                appType: 'octop',
                casdoorAppKey: 'OctopOff',
                agentGrantsEnabled: false,
                apiBaseUrlConfigured: false,
                apiAuthMode: null,
              },
            ],
          };
        }
        if (path.endsWith('/templates')) {
          return {
            data: [
              {
                id: 'tpl-1',
                name: 'Published Helper',
                description: 'A published expert',
                creatorUsername: 'admin',
                updatedAt: '2026-11-21T00:00:00.000Z',
              },
            ],
          };
        }
        if (path.endsWith('/createOptions')) {
          return {
            data: {
              roles: [
                {
                  id: 'admin',
                  name: 'Administrator',
                  systemRole: 'admin',
                  permissions: ['experts'],
                  maxAgents: 99,
                  tokenQuota: null,
                  workspaceRootDir: null,
                  allowedBackendTypes: ['docker'],
                },
                {
                  id: 'user',
                  name: 'User',
                  systemRole: 'user',
                  permissions: ['experts'],
                  maxAgents: 1,
                  tokenQuota: null,
                  workspaceRootDir: null,
                  allowedBackendTypes: ['docker'],
                },
              ],
              ldapConfigured: true,
              allowedBackendTypes: ['docker'],
              expertTemplateSource: 'published',
            },
          };
        }
        if (method === 'POST' && path.endsWith('/grants')) {
          return {
            data: {
              id: 'op-1',
              status: 'BOOTSTRAP_PENDING',
              operationMode: 'CREATE_USER_AND_INSTALL',
              selectedExpertCount: 1,
              completedExpertCount: 1,
              failedExpertCount: 0,
              skippedExpertCount: 0,
              bootstrapStatus: 'pending',
              agentId: 'agt-new',
              publishedExpertId: 'tpl-1',
              octopUserId: '30',
              errorCode: null,
              errorMessage: null,
            },
          };
        }
        return new Response(null, { status: 404 });
      }),
      services: (app) => {
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    });

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('JP_Dept')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.getByText('octop-a')).toBeInTheDocument();
    expect(screen.getByText('octop-b')).toBeInTheDocument();
    expect(screen.queryByText('Octop Off')).not.toBeInTheDocument();
    expect(screen.getByText('Employees 2')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', {
      name: copy.portalAgentUsersManage,
    })) {
      expect(button).toBeDisabled();
    }

    const initialize = screen.getByRole('button', {
      name: copy.portalAgentUsersInitialize,
    });
    expect(initialize).toBeDisabled();

    await user.click(screen.getByText('Alice'));
    expect(
      screen.getByRole('button', { name: copy.portalAgentUsersInitialize }),
    ).toBeEnabled();
    expect(
      screen.getAllByText(copy.portalAgentGrantsUnsynced).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByText('Bob'));
    expect(
      screen.getByRole('button', {
        name: copy.portalAgentGrantsInstallExperts,
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: copy.portalAgentUsersSyncUnsynced }),
    );
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    await user.click(screen.getByText('Alice'));
    expect(
      screen.getByRole('button', { name: copy.portalAgentUsersInitialize }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: copy.portalAgentUsersSyncSynced }),
    );
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    await user.click(screen.getByText('Bob'));
    expect(
      screen.getByRole('button', {
        name: copy.portalAgentGrantsInstallExperts,
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: copy.portalAgentUsersSyncAll }),
    );
    await user.click(
      screen.getByRole('combobox', { name: copy.portalAgentUsersInstance }),
    );
    await user.click(await screen.findByRole('option', { name: 'Octop B' }));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: copy.portalAgentUsersInstance }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: copy.portalAgentUsersInstanceAll,
      }),
    );
    await user.click(
      screen.getByRole('combobox', { name: copy.portalAgentUsersDepartment }),
    );
    await user.click(await screen.findByRole('option', { name: 'JP_Dept' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: copy.portalAgentUsersDepartment }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: copy.portalAgentUsersDepartmentAll,
      }),
    );
    const search = screen.getByRole('textbox', {
      name: copy.portalAgentUsersSearch,
    });
    await user.type(search, 'bob@example.com');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    await user.clear(search);

    await user.click(screen.getByText('Alice'));
    await user.click(
      screen.getByRole('button', { name: copy.portalAgentUsersInitialize }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(copy.portalAgentGrantsCreateTitle);
    expect(dialog).toHaveTextContent('alice');
    await user.click(await screen.findByText('Published Helper'));
    const submit = screen.getByRole('button', {
      name: copy.portalAgentGrantsSubmit,
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() =>
      expect(
        calls.filter(
          (call) => call.method === 'POST' && call.path.endsWith('/grants'),
        ),
      ).toHaveLength(1),
    );
    const grants = calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/grants'),
    );
    expect(grants[0]?.path).toBe(
      'enterpriseAppPortal/agentGrants/applications/octop-a/grants',
    );
    expect(grants[0]?.json).toMatchObject({
      casdoorUserId: 'org/alice',
      role: 'user',
      directory: true,
      expertTemplateIds: ['tpl-1'],
      defaultExpertTemplateId: null,
    });
    expect(grants[0]?.json).not.toHaveProperty('password');
    expect(grants[0]?.json).not.toHaveProperty('username');
    expect(
      await screen.findByRole('button', {
        name: copy.portalAgentGrantsReconcile,
      }),
    ).toBeVisible();
  });
});
