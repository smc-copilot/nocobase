import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import RouteEntryPage from '../../client/pages/route-entry.js';

describe('route-entry page', () => {
  it('issues a ticket and auto-submits the Router form_post', async () => {
    const submit = vi.fn();
    HTMLFormElement.prototype.submit = submit;

    await renderWithApp(<RouteEntryPage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(async ({ path, method, json }) => {
        if (path === 'enterpriseAppPortal/routeTickets/candidates') {
          return {
            data: {
              applications: [
                {
                  appCode: 'octop-a',
                  name: 'Octop A',
                  appType: 'octop',
                  businessCenter: null,
                  description: null,
                  enabled: true,
                  health: 'healthy',
                  isDefault: true,
                },
              ],
              autoLaunchMode: 'disabled',
              suggestedAppCode: null,
              routingEnabled: true,
            },
          };
        }
        if (path === 'enterpriseAppPortal/routeTickets' && method === 'POST') {
          expect(json).toEqual({ appCode: 'octop-a', mode: 'selected' });
          return {
            data: {
              ticket: 'header.payload.sig',
              appCode: 'octop-a',
              expiresIn: 30,
              requestId: 'req-1',
              submission: {
                method: 'POST',
                url: 'https://ai.superice.com:8090/api/entry',
              },
            },
          };
        }
        if (path === 'authorization/permissions') {
          return { data: { unrestricted: true, permissions: [] } };
        }
        return new Response(null, { status: 404 });
      }),
    });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.portal.routeEntry.title,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.portal.routeEntry.continue }),
    );

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });
    const ticketInput = document.querySelector(
      'input[name="ticket"]',
    ) as HTMLInputElement | null;
    expect(ticketInput?.value).toBe('header.payload.sig');
    expect(ticketInput?.form?.method.toLowerCase()).toBe('post');
    expect(ticketInput?.form?.action).toContain('/api/entry');
  });
});
