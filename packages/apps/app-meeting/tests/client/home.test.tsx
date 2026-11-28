import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
  type AuthorizationSnapshot,
} from '@nocobase/app-plugin-authorization/client';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';

const denied: AuthorizationSnapshot = {
  unrestricted: false,
  permissions: [],
};

function renderHome(
  permissions: () =>
    AuthorizationSnapshot | Promise<AuthorizationSnapshot> = () => denied,
) {
  return renderWithApp(<HomePage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(async ({ path }) =>
      path === 'authorization/permissions'
        ? { data: await permissions() }
        : new Response(null, { status: 404 }),
    ),
    services: (app) => {
      app.container.singleton(
        authorizationClientToken,
        (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
      );
    },
  });
}

describe('home page', () => {
  it('describes the Meeting application without a gateway query', async () => {
    await renderHome();

    expect(
      screen.getByRole('heading', { level: 1, name: enUS.home.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.home.description)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: enUS.meetings.title }),
    ).not.toBeInTheDocument();
  });

  it('links to meetings when the page is granted', async () => {
    await renderHome(() => ({
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'meetings' }, actions: ['access'] },
      ],
    }));
    expect(
      await screen.findByRole('link', { name: enUS.meetings.title }),
    ).toHaveAttribute('href', '/meetings');
  });
});
