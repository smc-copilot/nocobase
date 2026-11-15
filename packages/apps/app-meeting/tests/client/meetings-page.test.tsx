import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MeetingsPage from '../../client/pages/meetings/index.js';

describe('meetings page', () => {
  it('shows the empty state from a real empty list payload', async () => {
    await renderWithApp(<MeetingsPage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(async ({ path }) => {
        if (path === 'authorization/permissions') {
          return {
            data: {
              unrestricted: false,
              permissions: [
                {
                  resource: { type: 'page', id: 'meetings' },
                  actions: ['access'],
                },
              ],
            },
          };
        }
        if (path.startsWith('meetings')) {
          return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
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
      await screen.findByRole('heading', { name: enUS.meetings.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.meetings.queryNotConnected)).toBeVisible();
    expect(screen.getByText(enUS.meetings.empty)).toBeVisible();
    expect(screen.queryByText('Weekly standup')).not.toBeInTheDocument();
  });
});
