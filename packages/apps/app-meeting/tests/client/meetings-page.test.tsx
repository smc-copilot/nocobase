import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MeetingsPage from '../../client/pages/meetings/index.js';

function grantMeetingsPage() {
  return {
    data: {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'page', id: 'meetings' },
          actions: ['access'],
        },
        {
          resource: { type: 'composite', id: 'meeting' },
          actions: ['query', 'manageConnections', 'read', 'import'],
        },
      ],
    },
  };
}

function gatewayNotConfigured() {
  return {
    data: {
      contractReady: false,
      missingContract: ['MEETING_GATEWAY_CONTRACT_SHA256'],
    },
  };
}

function gatewayReady() {
  return {
    data: {
      contractReady: true,
      missingContract: [],
    },
  };
}

function binding(status: string) {
  return {
    data: {
      id: status === 'active' ? 'binding-1' : 'none',
      status,
      connectionName: status === 'active' ? 'Tencent' : null,
    },
  };
}

function renderMeetings(
  fetch: (input: {
    path: string;
    query?: Readonly<Record<string, string | readonly string[]>>;
  }) => unknown | Response,
) {
  return renderWithApp(<MeetingsPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(async ({ path, query }) => {
      if (path === 'authorization/permissions') return grantMeetingsPage();
      const result = fetch({ path, query });
      return result ?? new Response(null, { status: 404 });
    }),
    services: (app) => {
      app.container.singleton(
        authorizationClientToken,
        (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
      );
    },
  });
}

describe('meetings page', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe(): void {
          this.callback();
        }
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables login when the gateway contract is incomplete', async () => {
    await renderMeetings(({ path }) => {
      if (path === 'meetingGateway/config') return gatewayNotConfigured();
      if (path === 'meetingGateway/bindings') return binding('pending');
      if (path === 'meetingImportRuns') return { data: [] };
      if (path === 'meetings') {
        return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      }
      return undefined;
    });
    expect(
      await screen.findByRole('heading', { name: enUS.meetings.title }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) =>
        Boolean(
          node?.textContent?.includes(enUS.meetings.gatewayNotConfigured),
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: enUS.meetings.loginTencent }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.meetings.query }),
    ).toBeDisabled();
  });

  it('shows stored meetings without signing in; login is only for gateway query', async () => {
    await renderMeetings(({ path }) => {
      if (path === 'meetingGateway/config') return gatewayReady();
      if (path === 'meetingGateway/bindings') return binding('pending');
      if (path === 'meetingImportRuns') return { data: [] };
      if (path === 'meetings') {
        return {
          data: [
            {
              id: 'meeting-stored',
              title: 'Already imported',
              meetingCode: '123',
              importState: 'imported',
              oaMeetingCreated: false,
              createdAt: '2026-11-15T00:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1 },
        };
      }
      return undefined;
    });
    expect(
      await screen.findByRole('button', { name: enUS.meetings.loginTencent }),
    ).toBeVisible();
    expect(screen.getAllByText(enUS.meetings.loginHint).length).toBeGreaterThan(
      0,
    );
    expect(await screen.findByText('Already imported')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Already imported' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/meetings/meeting-stored'),
    );
  });

  it('shows the empty state from a real empty list payload when signed in', async () => {
    await renderMeetings(({ path }) => {
      if (path === 'meetingGateway/config') return gatewayReady();
      if (path === 'meetingGateway/bindings') return binding('active');
      if (path === 'meetingImportRuns') return { data: [] };
      if (path === 'meetings') {
        return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      }
      return undefined;
    });
    expect(
      await screen.findByRole('heading', { name: enUS.meetings.title }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) =>
        Boolean(node?.textContent?.includes(enUS.meetings.loggedIn)),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(enUS.meetings.empty)).toBeVisible();
    expect(screen.queryByText('Weekly standup')).not.toBeInTheDocument();
  });

  it('pages from the list total instead of the current page of rows', async () => {
    const requested: { path: string; pageSize?: string | readonly string[] }[] =
      [];
    const now = '2026-11-15T00:00:00.000Z';
    await renderMeetings(({ path, query }) => {
      if (path === 'meetingGateway/config') return gatewayReady();
      if (path === 'meetingGateway/bindings') return binding('active');
      if (path === 'meetingImportRuns') return { data: [] };
      if (path !== 'meetings') return undefined;
      requested.push({ path, pageSize: query?.pageSize });
      return {
        data: Array.from({ length: 20 }, (_, index) => ({
          id: `meeting-${index + 1}`,
          title: `Meeting ${index + 1}`,
          meetingCode: `code-${index + 1}`,
          importState: 'not_imported',
          createdAt: now,
        })),
        meta: { page: 1, pageSize: 20, total: 25 },
      };
    });
    expect(await screen.findByText('Meeting 1')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Meeting 1' })).toHaveAttribute(
      'href',
      expect.stringContaining('/meetings/meeting-1'),
    );
    expect(screen.getByText('Meeting 20')).toBeVisible();
    expect(requested.some((call) => call.pageSize === '20')).toBe(true);
    expect(
      screen.getByText(
        enUS.dataTable.pageOf
          .replace('{{page}}', '1')
          .replace('{{pageCount}}', '2'),
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.dataTable.nextPage }),
    ).toBeEnabled();
  });
});
