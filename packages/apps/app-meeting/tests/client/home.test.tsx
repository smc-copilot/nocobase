import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
  type AuthorizationSnapshot,
} from '@nocobase/app-plugin-authorization/client';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import {
  CAPABILITY_GUIDE_PATH,
  capabilityPath,
  createCapabilityCatalog,
  entryContent,
  format,
  guideContent,
} from '@nocobase/app-plugin-foundation/capability-guide';

const catalog = createCapabilityCatalog(packageMetadata);
const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const granted: AuthorizationSnapshot = {
  unrestricted: false,
  permissions: [
    { resource: { type: 'page', id: 'capability-guide' }, actions: ['access'] },
  ],
};

function renderHome(
  permissions: () =>
    AuthorizationSnapshot | Promise<AuthorizationSnapshot> = () => granted,
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

  it('features capabilities from the shared guide catalog, each linking to its entry', async () => {
    await renderHome();
    const content = guideContent('en-US');

    expect(catalog.featured.length).toBeGreaterThan(0);
    for (const entry of catalog.featured) {
      const title = entryContent(content, entry).title;
      expect(
        await screen.findByRole('link', { name: new RegExp(escape(title)) }),
      ).toHaveAttribute('href', capabilityPath(entry.id));
    }
  });

  it('leads to the full catalog, counted from the dependencies this application declares', async () => {
    await renderHome();
    const content = guideContent('en-US');

    expect(
      await screen.findByRole('link', {
        name: format(content.home.viewAll, { count: catalog.entries.length }),
      }),
    ).toHaveAttribute('href', CAPABILITY_GUIDE_PATH);
  });

  it.each<AuthorizationSnapshot>([
    { unrestricted: true, permissions: [] },
    {
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: '*' }, actions: ['access'] },
      ],
    },
  ])(
    'keeps catalog links for unrestricted and wildcard grants: %j',
    async (snapshot) => {
      await renderHome(() => snapshot);
      expect(
        await screen.findByRole('link', {
          name: format(guideContent('en-US').home.viewAll, {
            count: catalog.entries.length,
          }),
        }),
      ).toHaveAttribute('href', CAPABILITY_GUIDE_PATH);
    },
  );

  it('keeps descriptions without links while permissions load, after denial and after revocation', async () => {
    const pending = Promise.withResolvers<AuthorizationSnapshot>();
    let permissions: AuthorizationSnapshot | Promise<AuthorizationSnapshot> =
      pending.promise;
    const { app } = await renderHome(() => permissions);
    const authorization = app.container.resolve(authorizationClientToken);
    const content = guideContent('en-US');
    const expectDescriptionsOnly = () => {
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(screen.queryByText(content.home.open)).not.toBeInTheDocument();
      for (const entry of catalog.featured) {
        const text = entryContent(content, entry);
        expect(screen.getByText(text.title)).toBeVisible();
        expect(screen.getByText(text.summary)).toBeVisible();
      }
    };
    expectDescriptionsOnly();
    await act(async () => {
      pending.resolve({ unrestricted: false, permissions: [] });
      await authorization.snapshot();
    });
    expectDescriptionsOnly();
    await act(async () => {
      permissions = granted;
      authorization.invalidate();
      await authorization.snapshot();
    });
    expect(
      await screen.findByRole('link', {
        name: format(content.home.viewAll, { count: catalog.entries.length }),
      }),
    ).toHaveAttribute('href', CAPABILITY_GUIDE_PATH);
    await act(async () => {
      permissions = { unrestricted: false, permissions: [] };
      authorization.invalidate();
      await authorization.snapshot();
    });
    expectDescriptionsOnly();
  });

  it('links to meetings when the page is granted', async () => {
    await renderHome(() => ({
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'meetings' }, actions: ['access'] },
        {
          resource: { type: 'page', id: 'capability-guide' },
          actions: ['access'],
        },
      ],
    }));
    expect(
      await screen.findByRole('link', { name: enUS.meetings.title }),
    ).toHaveAttribute('href', '/meetings');
  });
});
