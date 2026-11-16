import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MeetingDetailPage from '../../client/pages/meetings/detail.js';

function grantMeetingsPage() {
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

describe('meeting detail page', () => {
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

  it('shows unavailable copy for a missing local meeting instead of inventing fields', async () => {
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId' element={<MeetingDetailPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/local-test-missing',
        fetch: answerApi(async ({ path }) => {
          if (path === 'authorization/permissions') return grantMeetingsPage();
          if (path.startsWith('meetings/local-test-missing')) {
            return new Response(
              JSON.stringify({
                error: {
                  reason: 'ACCESS_DENIED',
                  message: 'This meeting is unavailable.',
                },
              }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            );
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
      },
    );
    expect(
      await screen.findByRole('heading', { name: enUS.meetings.unavailable }),
    ).toBeVisible();
    expect(
      screen.queryByText(enUS.meetings.recordingAvailable),
    ).not.toBeInTheDocument();
  });
});
