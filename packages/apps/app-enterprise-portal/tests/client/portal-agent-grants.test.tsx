import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import PortalAgentGrantsPage from '../../client/pages/settings/portal-agent-grants.js';
import {
  agentGrantOctopStatePath,
  agentGrantResultKind,
  buildAgentGrantCreateBody,
  expertStatusText,
  roleDraftFields,
  selectAgentGrantApplications,
  selectableRoles,
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

  it('sends only the server create fields and replaces permissions with the role', () => {
    const body = buildAgentGrantCreateBody({
      casdoorUserId: 'org/alice',
      displayName: 'Alice',
      email: '',
      roleId: 'user',
      permissions: ['experts'],
      maxAgents: '',
      tokenQuota: '',
      workspaceRootDir: '',
      allowedBackendTypes: ['docker'],
      createDefaultExpert: true,
      expertTemplateId: 'tpl-1',
    });
    expect(body).toEqual({
      casdoorUserId: 'org/alice',
      displayName: 'Alice',
      email: null,
      role: 'user',
      permissions: ['experts'],
      workspaceRootDir: null,
      tokenQuota: null,
      maxAgents: null,
      allowedBackendTypes: ['docker'],
      createDefaultExpert: true,
      expertTemplateId: 'tpl-1',
    });
    expect(body && Object.keys(body)).not.toEqual(
      expect.arrayContaining([
        'password',
        'apiToken',
        'secret',
        'username',
        'directory',
        'roleName',
        'expertTemplateSource',
      ]),
    );
    expect(
      buildAgentGrantCreateBody({
        casdoorUserId: 'org/alice',
        displayName: 'Alice',
        email: '',
        roleId: 'user',
        permissions: [],
        maxAgents: '1',
        tokenQuota: '',
        workspaceRootDir: '',
        allowedBackendTypes: [],
        createDefaultExpert: false,
      }),
    ).not.toHaveProperty('expertTemplateId');
    const catalog = {
      permissions: [
        { key: 'experts', category: 'agent', label: 'Experts' },
        { key: 'workspace', category: 'agent', label: 'Workspace' },
      ],
      backendTypes: ['docker'],
    };
    expect(
      roleDraftFields(
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
        catalog,
      ).permissions,
    ).toEqual(['experts']);
    expect(
      roleDraftFields(
        {
          id: 'expert',
          name: 'Expert',
          systemRole: 'expert',
          permissions: ['workspace', 'not-in-catalog'],
          maxAgents: 2,
          tokenQuota: null,
          workspaceRootDir: '/work',
          allowedBackendTypes: ['docker', 'unknown'],
        },
        catalog,
      ),
    ).toMatchObject({
      roleId: 'expert',
      permissions: ['workspace'],
      maxAgents: '2',
      workspaceRootDir: '/work',
      allowedBackendTypes: ['docker'],
    });
  });
});

describe('agent grants page', () => {
  it('single-selects an employee, hides WeKnora, and keeps pending distinct from completed', async () => {
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
              },
              {
                casdoorUserId: 'org/bob',
                username: 'bob',
                displayName: 'Bob',
                email: 'bob@example.com',
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
              permissions: [
                { key: 'experts', category: 'agent', label: 'Experts' },
              ],
              ldapConfigured: true,
              supportedBackendTypes: ['docker'],
              directoryLocked: true,
              expertTemplateSource: 'published',
            },
          };
        }
        if (method === 'POST' && path.endsWith('/grants')) {
          return {
            data: {
              id: 'op-1',
              status: 'BOOTSTRAP_PENDING',
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
      await screen.findByRole('radio', { name: 'Octop A' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: 'WeKnora' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: 'Octop Off' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Octop A' }));
    const employees = await screen.findByRole('region', {
      name: copy.portalAgentGrantsEmployees,
    });
    await user.click(
      await within(employees).findByRole('radio', { name: 'Alice (alice)' }),
    );
    await user.click(
      within(employees).getByRole('radio', { name: 'Bob (bob)' }),
    );

    expect(
      within(employees).getByRole('radio', { name: 'Alice (alice)' }),
    ).not.toBeChecked();
    expect(
      within(employees).getByRole('radio', { name: 'Bob (bob)' }),
    ).toBeChecked();
    expect(
      await screen.findByText(copy.portalAgentGrantsAccountExists),
    ).toBeVisible();
    expect(screen.getByText('Agent ID: agt-1')).toBeVisible();
    expect(screen.getByText('Published template ID: tpl-9')).toBeVisible();
    expect(screen.getByText(pending)).toBeVisible();
    expect(screen.queryByText(completed)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.portalAgentGrantsCreate }),
    ).toBeDisabled();
    expect(calls.filter((call) => call.path.endsWith('/grants'))).toHaveLength(
      0,
    );

    await user.click(
      within(employees).getByRole('radio', { name: 'Alice (alice)' }),
    );
    expect(
      await screen.findByText(copy.portalAgentGrantsAccountMissing),
    ).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Published Helper' }));
    const create = screen.getByRole('button', {
      name: copy.portalAgentGrantsCreate,
    });
    await waitFor(() => expect(create).toBeEnabled());
    await user.click(create);
    const dialog = await screen.findByRole('dialog', {
      name: copy.portalAgentGrantsCreateTitle,
    });
    expect(
      within(dialog).getByLabelText(copy.portalAgentGrantsUsername),
    ).toHaveValue('alice');
    await user.click(within(dialog).getByRole('combobox'));
    expect(
      screen.queryByRole('option', { name: 'Administrator' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'User' })).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', {
      name: copy.portalAgentGrantsSubmit,
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    const result = await screen.findByTestId('agent-grant-result');
    expect(result).toHaveAttribute('data-result-kind', 'BOOTSTRAP_PENDING');
    expect(result).not.toHaveAttribute('data-result-kind', 'COMPLETED');
    expect(within(result).getByText(pending)).toBeVisible();
    expect(within(result).queryByText(completed)).not.toBeInTheDocument();
    expect(screen.queryByText(completed)).not.toBeInTheDocument();
    const grants = calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/grants'),
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]?.path).toBe(
      'enterpriseAppPortal/agentGrants/applications/octop-a/grants',
    );
    expect(grants[0]?.json).toMatchObject({
      casdoorUserId: 'org/alice',
      role: 'user',
      createDefaultExpert: true,
      expertTemplateId: 'tpl-1',
    });
    expect(grants[0]?.json).not.toHaveProperty('password');
    expect(grants[0]?.json).not.toHaveProperty('directory');
    expect(grants[0]?.json).not.toHaveProperty('username');
  });
});
