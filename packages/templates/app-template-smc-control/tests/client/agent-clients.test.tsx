import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import AgentClientsPage from '../../client/pages/settings/agent-authorization/clients.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const copy = enUS.agentAuthorization;

interface StoredClient {
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly instanceLabel: string | null;
  readonly authMethod: 'client_secret_post' | 'client_secret_basic';
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly enabled: boolean;
  readonly secretVersion: number;
}

const desk: StoredClient = {
  clientId: 'client_1',
  name: 'Desk',
  description: 'Front desk agent',
  instanceLabel: 'desk-a',
  authMethod: 'client_secret_basic',
  redirectUris: ['http://a.example/cb', 'http://b.example/cb'],
  allowedScopes: ['business-ui:view'],
  allowedOrigins: ['https://app.example', 'https://admin.example'],
  enabled: true,
  secretVersion: 1,
};

function renderClients(
  handler: (call: {
    readonly method: string;
    readonly path: string;
    readonly json?: unknown;
  }) => unknown,
) {
  return renderWithApp(<AgentClientsPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(handler),
  });
}

describe('agent client registration', () => {
  it('rejects a bad redirect list, then registers every field and shows method and origins', async () => {
    const user = userEvent.setup();
    const clients: StoredClient[] = [];
    const posts: unknown[] = [];
    await renderClients(({ method, path, json }) => {
      if (method === 'GET' && path === 'agentAuthorization/clients') {
        return { data: clients };
      }
      if (method === 'POST' && path === 'agentAuthorization/clients') {
        posts.push(json);
        clients.push(desk);
        return { data: { ...desk, clientSecret: 'secret-once' } };
      }
      return new Response(null, { status: 404 });
    });

    expect(await screen.findByText(copy.empty)).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: copy.name }), 'Desk');
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(screen.getByText(copy.redirectUrisRequired)).toBeVisible();
    expect(posts).toEqual([]);

    await user.type(
      screen.getByRole('textbox', { name: copy.redirectUris }),
      'not a url',
    );
    await user.click(screen.getByRole('button', { name: copy.create }));
    expect(screen.getByText(copy.invalidUrls)).toBeVisible();
    expect(posts).toEqual([]);

    const redirects = screen.getByRole('textbox', { name: copy.redirectUris });
    await user.clear(redirects);
    await user.type(redirects, 'http://a.example/cb, http://b.example/cb');
    await user.type(
      screen.getByRole('textbox', { name: copy.clientDescription }),
      'Front desk agent',
    );
    await user.type(
      screen.getByRole('textbox', { name: copy.instanceLabel }),
      'desk-a',
    );
    await user.type(
      screen.getByRole('textbox', { name: copy.allowedOrigins }),
      'https://app.example{enter}https://admin.example',
    );
    await user.click(screen.getByRole('combobox', { name: copy.authMethod }));
    await user.click(
      await screen.findByRole('option', {
        name: copy.authMethodLabel.client_secret_basic,
      }),
    );
    await user.click(screen.getByRole('button', { name: copy.create }));

    expect(posts).toEqual([
      {
        name: 'Desk',
        description: 'Front desk agent',
        instanceLabel: 'desk-a',
        redirectUris: ['http://a.example/cb', 'http://b.example/cb'],
        allowedOrigins: ['https://app.example', 'https://admin.example'],
        allowedScopes: ['business-ui:view'],
        authMethod: 'client_secret_basic',
        enabled: true,
      },
    ]);
    expect(await screen.findByText('secret-once')).toBeVisible();
    const table = screen.getByRole('table');
    expect(
      within(table).getByText(copy.authMethodLabel.client_secret_basic),
    ).toBeVisible();
    expect(
      within(table).getByText('https://app.example, https://admin.example'),
    ).toBeVisible();
  });

  it('edits registration fields and leaves authentication method and the secret unchanged', async () => {
    const user = userEvent.setup();
    let client: StoredClient = { ...desk };
    const writes: {
      readonly method: string;
      readonly path: string;
      readonly json?: unknown;
    }[] = [];
    await renderClients(({ method, path, json }) => {
      if (method === 'GET' && path === 'agentAuthorization/clients') {
        return { data: [client] };
      }
      if (
        method === 'PATCH' &&
        path === 'agentAuthorization/clients/client_1'
      ) {
        writes.push({ method, path, json });
        const patch = json as Partial<StoredClient>;
        client = { ...client, ...patch };
        return { data: client };
      }
      if (
        method === 'POST' &&
        path === 'agentAuthorization/clients/client_1/rotateSecret'
      ) {
        writes.push({ method, path, json });
        return { data: { ...client, clientSecret: 'rotated-secret' } };
      }
      return new Response(null, { status: 404 });
    });

    expect(
      await screen.findByText(copy.authMethodLabel.client_secret_basic),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.edit }));
    expect(
      screen.getAllByRole('combobox', { name: copy.authMethod }),
    ).toHaveLength(1);

    const editor = screen
      .getByRole('button', { name: copy.save })
      .closest('form');
    if (!editor) throw new Error('Edit form did not open');
    const fields = within(editor);
    await user.clear(fields.getByRole('textbox', { name: copy.name }));
    await user.type(
      fields.getByRole('textbox', { name: copy.name }),
      'Renamed',
    );
    await user.clear(
      fields.getByRole('textbox', { name: copy.clientDescription }),
    );
    const redirects = fields.getByRole('textbox', { name: copy.redirectUris });
    await user.clear(redirects);
    await user.type(redirects, 'http://a.example/cb');
    await user.clear(
      fields.getByRole('textbox', { name: copy.allowedOrigins }),
    );
    await user.click(
      fields.getByRole('checkbox', { name: copy.scope['business-ui:edit'] }),
    );
    await user.click(screen.getByRole('button', { name: copy.save }));

    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: 'agentAuthorization/clients/client_1',
        json: {
          name: 'Renamed',
          description: null,
          instanceLabel: 'desk-a',
          redirectUris: ['http://a.example/cb'],
          allowedOrigins: [],
          allowedScopes: ['business-ui:view', 'business-ui:edit'],
        },
      },
    ]);
    expect(await screen.findByText('Renamed')).toBeVisible();

    await user.click(screen.getByRole('button', { name: copy.rotate }));
    expect(await screen.findByText('rotated-secret')).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.disable }));
    expect(writes[1]).toEqual({
      method: 'POST',
      path: 'agentAuthorization/clients/client_1/rotateSecret',
      json: undefined,
    });
    expect(writes[2]).toEqual({
      method: 'PATCH',
      path: 'agentAuthorization/clients/client_1',
      json: { enabled: false },
    });
  });
});
