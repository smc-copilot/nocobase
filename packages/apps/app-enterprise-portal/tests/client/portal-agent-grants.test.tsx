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
import PortalAgentGrantsPage from '../../client/pages/settings/portal-agent-grants.js';
import {
  agentGrantOctopStatePath,
  agentGrantResultKind,
  buildAgentGrantCreateBody,
  emptyCreateDraft,
  expertStatusText,
  roleDraftFields,
  selectAgentGrantApplications,
  selectableRoles,
  toggleExpertTemplate,
} from '../../client/pages/settings/portal-agent-grants-model.js';

const copy = enUS.settings;
const pending = copy.portalAgentGrantsBootstrapPending;
const completed = copy.portalAgentGrantsCompleted;

describe('agent grant presentation', () => {
  it('keeps WeKnora and disabled Octop apps out of the list', () => {
    expect(
      selectableRoles([
        { id: 'admin', systemRole: 'admin' },
        { id: 'user', systemRole: 'user' },
      ]).map((role) => role.id),
    ).toEqual(['user']);
    expect(
      selectAgentGrantApplications([
        {
          name: 'WeKnora',
          appType: 'https',
          agentGrantsEnabled: true,
        },
        {
          name: 'WeKnora labeled octop by mistake is still filtered when the type is not octop',
          appType: 'weknora',
          agentGrantsEnabled: true,
        },
        {
          name: 'Octop Off',
          appType: 'octop',
          agentGrantsEnabled: false,
        },
        {
          name: 'Octop A',
          appType: ' Octop ',
          agentGrantsEnabled: true,
        },
      ]).map((application) => application.name),
    ).toEqual(['Octop A']);
  });

  it('never presents a pending bootstrap as completed', () => {
    expect(
      agentGrantResultKind({
        status: 'COMPLETED',
        bootstrapStatus: 'pending',
      }),
    ).toBe('BOOTSTRAP_PENDING');
    expect(
      agentGrantResultKind({
        status: 'BOOTSTRAP_PENDING',
        bootstrapStatus: 'pending',
      }),
    ).toBe('BOOTSTRAP_PENDING');
    expect(
      agentGrantResultKind({ status: 'COMPLETED', bootstrapStatus: null }),
    ).toBe('COMPLETED');
    expect(agentGrantResultKind({ status: 'PARTIAL' })).toBe('PARTIAL');
    expect(agentGrantResultKind({ status: 'ACCOUNT_EXISTS' })).toBe(
      'ACCOUNT_EXISTS',
    );
    expect(agentGrantOctopStatePath('octop-a', 'org/alice')).toBe(
      'enterpriseAppPortal/agentGrants/applications/octop-a/employees/org/alice/octopState',
    );
    expect(
      expertStatusText({ state: 'completed', bootstrapPending: true }, pending),
    ).toBe(pending);
    expect(
      expertStatusText(
        { state: 'completed', bootstrapPending: false },
        pending,
      ),
    ).toBe('completed');
  });

  it('builds the simplified create body and keeps default expert optional for new users', () => {
    const draft = toggleExpertTemplate(
      {
        ...emptyCreateDraft('user'),
        maxAgentsEnabled: false,
        tokenQuotaEnabled: false,
        workspaceEnabled: false,
      },
      'tpl-1',
      true,
      true,
    );
    expect(draft.defaultExpertTemplateId).toBeNull();
    const body = buildAgentGrantCreateBody({
      casdoorUserId: 'org/alice',
      isNewUser: true,
      draft,
    });
    expect(body).toEqual({
      casdoorUserId: 'org/alice',
      role: 'user',
      workspaceRootDir: null,
      tokenQuota: null,
      maxAgents: null,
      directory: true,
      expertTemplateIds: ['tpl-1'],
      defaultExpertTemplateId: null,
    });
    expect(
      buildAgentGrantCreateBody({
        casdoorUserId: 'org/alice',
        isNewUser: true,
        draft: emptyCreateDraft('user'),
      }),
    ).toEqual({
      casdoorUserId: 'org/alice',
      role: 'user',
      workspaceRootDir: null,
      tokenQuota: null,
      maxAgents: null,
      directory: true,
      expertTemplateIds: [],
      defaultExpertTemplateId: null,
    });
    expect(body && Object.keys(body)).not.toEqual(
      expect.arrayContaining([
        'confirmPassword',
        'apiToken',
        'secret',
        'username',
        'displayName',
        'email',
        'permissions',
        'allowedBackendTypes',
      ]),
    );
    expect(
      buildAgentGrantCreateBody({
        casdoorUserId: 'org/alice',
        isNewUser: false,
        draft: {
          ...draft,
          defaultExpertTemplateId: null,
          maxAgentsEnabled: true,
          maxAgents: '1',
          tokenQuotaEnabled: true,
          tokenQuota: '10',
        },
      }),
    ).toMatchObject({
      defaultExpertTemplateId: null,
      expertTemplateIds: ['tpl-1'],
      maxAgents: null,
      tokenQuota: null,
    });
    expect(
      buildAgentGrantCreateBody({
        casdoorUserId: 'org/alice',
        isNewUser: false,
        draft: emptyCreateDraft('user'),
      }),
    ).toBeUndefined();
    expect(
      buildAgentGrantCreateBody({
        casdoorUserId: 'org/alice',
        isNewUser: true,
        draft: {
          ...draft,
          maxAgentsEnabled: true,
          maxAgents: '1',
          expertTemplateIds: ['tpl-1', 'tpl-2'],
          defaultExpertTemplateId: 'tpl-1',
        },
      }),
    ).toBeUndefined();
    expect(
      roleDraftFields({
        id: 'expert',
        name: 'Expert',
        systemRole: 'expert',
        permissions: ['workspace'],
        maxAgents: 2,
        tokenQuota: null,
        workspaceRootDir: '/work',
        allowedBackendTypes: ['docker'],
      }),
    ).toMatchObject({
      roleId: 'expert',
      maxAgents: '2',
      workspaceRootDir: '/work',
      workspaceEnabled: true,
      maxAgentsEnabled: true,
      tokenQuotaEnabled: false,
    });
  });
});

describe('agent grants page', () => {
  it('single-selects an employee in the table and opens the simplified dialog', async () => {
    const user = userEvent.setup();
    const calls: { method: string; path: string; json?: unknown }[] = [];
    await renderWithApp(<PortalAgentGrantsPage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(async ({ method, path, json }) => {
        calls.push({ method, path, json });
        if (path === 'authorization/permissions') {
          return { data: { unrestricted: true, permissions: [] } };
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
                appCode: 'octop-off',
                name: 'Octop Off',
                appType: 'octop',
                casdoorAppKey: 'OctopOff',
                agentGrantsEnabled: false,
                apiBaseUrlConfigured: false,
                apiAuthMode: null,
              },
              {
                appCode: 'weknora',
                name: 'WeKnora',
                appType: 'https',
                casdoorAppKey: 'WeKnora',
                agentGrantsEnabled: true,
                apiBaseUrlConfigured: false,
                apiAuthMode: null,
              },
            ],
          };
        }
        if (path.endsWith('/octopState') && path.includes('/alice/')) {
          return {
            data: {
              accountExists: false,
              disabled: false,
              octopUserId: null,
              experts: [],
            },
          };
        }
        if (path.endsWith('/octopState') && path.includes('/bob/')) {
          return {
            data: {
              accountExists: true,
              disabled: false,
              octopUserId: '22',
              experts: [
                {
                  agentId: 'agt-1',
                  publishedExpertId: 'tpl-9',
                  name: 'Helper',
                  state: 'running',
                  bootstrapPending: true,
                },
              ],
            },
          };
        }
        if (path.endsWith('/employees')) {
          return {
            data: [
              {
                casdoorUserId: 'org/alice',
                username: 'alice',
                displayName: 'Alice',
                email: 'alice@example.com',
                accountExists: false,
                octopUserId: null,
                disabled: false,
                syncedAt: null,
                experts: [],
              },
              {
                casdoorUserId: 'org/bob',
                username: 'bob',
                displayName: 'Bob',
                email: 'bob@example.com',
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
                    bootstrapPending: true,
                  },
                ],
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
              {
                id: 'tpl-2',
                name: 'Ops Expert',
                description: 'Ops',
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

    expect(
      await screen.findByRole('radio', { name: /Octop A/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('WeKnora')).not.toBeInTheDocument();
    expect(screen.queryByText('Octop Off')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Octop A/i }));
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    await user.click(screen.getByText('Bob'));
    expect(
      await screen.findByText((content) => content.includes('Helper')),
    ).toBeVisible();
    expect(
      screen.getByText((content) => content.includes(pending)),
    ).toBeVisible();
    expect(
      screen.queryByText((content) => content === completed),
    ).not.toBeInTheDocument();

    const installButton = screen.getByRole('button', {
      name: copy.portalAgentGrantsInstallExperts,
    });
    expect(installButton).toBeEnabled();

    await user.click(screen.getByText('Alice'));
    expect(
      screen.getAllByText(copy.portalAgentGrantsUnsynced).length,
    ).toBeGreaterThan(0);
    const createButton = screen.getByRole('button', {
      name: copy.portalAgentGrantsCreate,
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(copy.portalAgentGrantsCreateTitle);
    expect(dialog).toHaveTextContent('alice');
    expect(dialog).toHaveTextContent(copy.portalAgentGrantsDockerSandbox);
    expect(
      screen.queryByText(copy.portalAgentGrantsPermissions),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('Published Helper'));
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
    expect(grants[0]?.json).toMatchObject({
      casdoorUserId: 'org/alice',
      role: 'user',
      directory: true,
      expertTemplateIds: ['tpl-1'],
      defaultExpertTemplateId: null,
    });
    expect(grants[0]?.json).not.toHaveProperty('password');
    expect(grants[0]?.json).not.toHaveProperty('permissions');
    expect(grants[0]?.json).not.toHaveProperty('username');
    expect(await screen.findByText(pending)).toBeVisible();
  });
});
