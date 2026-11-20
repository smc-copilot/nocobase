import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MeetingSummaryPage from '../../client/pages/meetings/summary.js';

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

describe('meeting summary page', () => {
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

  it('shows four minutes groups and dual dialogues without mixing projection', async () => {
    await renderWithApp(
      <Routes>
        <Route
          path='/meetings/:meetingId/summary'
          element={<MeetingSummaryPage />}
        />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/summary',
        fetch: answerApi(async ({ path }) => {
          if (path === 'authorization/permissions') return grantMeetingsPage();
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'LOCAL_SUMMARY', source: 'local' },
                tencentMinutes: {
                  ai_ds_minutes: 'DEEPSEEK_RAW',
                  ai_minutes: '',
                  ai_speaker_minutes: 'SPEAKER_RAW',
                  ai_topic_minutes: '',
                },
                tencentDialogues: {
                  original: 'ORIGINAL_ONLY',
                  optimized: 'OPTIMIZED_ONLY',
                },
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
      },
    );
    expect(
      await screen.findByRole('tablist', { name: enUS.meetings.summaryTitle }),
    ).toBeVisible();
    expect(screen.getByText(enUS.meetings.summary.deepseek)).toBeVisible();
    expect(screen.getByText(enUS.meetings.summary.chapters)).toBeVisible();
    expect(screen.getByText(enUS.meetings.summary.speaker)).toBeVisible();
    expect(screen.getByText(enUS.meetings.summary.topic)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.meetings.summary.dialogues }),
    ).toBeVisible();
    expect(
      screen.queryByText(enUS.meetings.summaryDescription),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.meetings.summaryReadOnly),
    ).not.toBeInTheDocument();
    expect(screen.getByText('DEEPSEEK_RAW')).toBeVisible();
    expect(screen.queryByText('LOCAL_SUMMARY')).not.toBeInTheDocument();
    expect(screen.queryByText('ORIGINAL_ONLY')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('tab', { name: enUS.meetings.summary.chapters }),
    );
    expect(
      await screen.findByText(enUS.meetings.summaryEmptyMinutes),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetings.summary.dialogues }),
    );
    expect(await screen.findByText('ORIGINAL_ONLY')).toBeVisible();
    await userEvent.type(
      screen.getByRole('textbox', {
        name: enUS.meetings.summary.searchPlaceholder,
      }),
      'ORIGINAL',
    );
    expect(
      await screen.findByText(
        enUS.meetings.summary.searchMatches
          .replace('{{current}}', '1')
          .replace('{{total}}', '1'),
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('tab', { name: enUS.meetings.summary.optimized }),
    );
    expect(await screen.findByText('OPTIMIZED_ONLY')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS.meetingOa.saveDraft }),
    ).not.toBeInTheDocument();
  });

  it('shows retry copy when the meeting content is unavailable', async () => {
    await renderWithApp(
      <Routes>
        <Route
          path='/meetings/:meetingId/summary'
          element={<MeetingSummaryPage />}
        />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/missing/summary',
        fetch: answerApi(async ({ path }) => {
          if (path === 'authorization/permissions') return grantMeetingsPage();
          if (path.startsWith('meetings/missing')) {
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
    expect(await screen.findByText(enUS.meetings.unavailable)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.meetings.retry }),
    ).toBeVisible();
  });
});
