import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderMeetings(
  fetch: (input: { method: string; path: string }) => unknown | Response,
) {
  return renderWithApp(<MeetingsPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(async ({ method, path }) => {
      if (path === 'authorization/permissions') return grantMeetingsPage();
      const result = fetch({ method, path });
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

function signedInShell(path: string): unknown {
  if (path === 'meetingGateway/config') {
    return { data: { contractReady: true, missingContract: [] } };
  }
  if (path === 'meetingGateway/bindings') {
    return {
      data: { id: 'binding-1', status: 'active', connectionName: 'Tencent' },
    };
  }
  if (path === 'meetingImportRuns') return { data: [] };
  return undefined;
}

const meeting = {
  id: 'meeting-1',
  title: 'Weekly standup',
  meetingCode: '998877',
  importState: 'not_imported',
  participantFetchStatus: 'fetched',
  createdAt: '2026-11-15T00:00:00.000Z',
};

describe('meeting preview', () => {
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

  it('opens the participants dialog and shows the join name column', async () => {
    const user = userEvent.setup();
    await renderMeetings(({ path }) => {
      const shell = signedInShell(path);
      if (shell) return shell;
      if (path === 'meetings') {
        return {
          data: [meeting],
          meta: { page: 1, pageSize: 20, total: 1 },
        };
      }
      if (path === 'meetings/meeting-1/participants') {
        return {
          data: [
            {
              id: 'person-1',
              joinName: 'Ada Join',
              displayName: 'Ada Display',
              department: 'Research',
              joinedAt: '2026-11-15T02:03:04.000Z',
              jobTitle: 'Engineer',
              isCorpMember: true,
            },
          ],
          meta: { total: 1 },
        };
      }
      return undefined;
    });

    await user.click(
      await screen.findByRole('button', {
        name: enUS.meetings.viewParticipants,
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: enUS.meetings.viewParticipantsTitle
        .replace('{{title}}', 'Weekly standup')
        .replace('{{code}}', '998877'),
    });
    expect(within(dialog).getByText(enUS.meetings.joinName)).toBeVisible();
    expect(await within(dialog).findByText('Ada Join')).toBeVisible();
    expect(within(dialog).queryByText('Ada Display')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Research')).toBeVisible();
    expect(within(dialog).getByText(enUS.meetings.corpMemberYes)).toBeVisible();
  });

  it('keeps the selected recording when view details opens another file', async () => {
    const user = userEvent.setup();
    const calls: { method: string; path: string }[] = [];
    await renderMeetings(({ method, path }) => {
      calls.push({ method, path });
      const shell = signedInShell(path);
      if (shell) return shell;
      if (path === 'meetings') {
        return {
          data: [meeting],
          meta: { page: 1, pageSize: 20, total: 1 },
        };
      }
      if (path === 'meetings/meeting-1/recordings') {
        return {
          data: [
            {
              id: 'rec-a',
              recordFileId: 'file-a',
              available: true,
              sharingUrl: 'https://share.example/a',
              allowDownload: true,
              importability: 'importable',
              unavailableReason: null,
            },
            {
              id: 'rec-b',
              recordFileId: 'file-b',
              available: true,
              sharingUrl: 'https://share.example/b',
              allowDownload: false,
              importability: 'importable',
              unavailableReason: null,
            },
          ],
          meta: { total: 2 },
        };
      }
      if (path === 'meetings/meeting-1/recordings/file-b/detail') {
        return {
          data: {
            meetingId: 'meeting-1',
            recordFileId: 'file-b',
            viewAddress: null,
            downloadAddress: null,
            downloadAddressFileType: null,
            audioAddress: null,
            audioAddressFileType: null,
            meetingSummary: [],
            aiMeetingTranscripts: [],
            aiMinutes: [],
            aiTopicMinutes: [],
            aiSpeakerMinutes: [],
            aiDsMinutes: [],
            recordInfo: [],
            fetchedAt: '2026-11-15T00:00:00.000Z',
          },
        };
      }
      return undefined;
    });

    await user.click(
      await screen.findByRole('button', { name: enUS.meetings.import }),
    );
    const pickerTitle = enUS.meetings.importPickTitle.replace(
      '{{code}}',
      '998877',
    );
    const picker = await screen.findByRole('dialog', { name: pickerTitle });
    await user.click(within(picker).getByRole('radio', { name: 'file-a' }));
    const fileB = within(picker).getByText('file-b').closest('li');
    expect(fileB).not.toBeNull();
    await user.click(
      within(fileB as HTMLElement).getByRole('button', {
        name: enUS.meetings.viewDetail,
      }),
    );

    const pickerAfter = screen.getByRole('dialog', {
      name: pickerTitle,
      hidden: true,
    });
    expect(
      within(pickerAfter).getByRole('radio', {
        name: 'file-a',
        hidden: true,
      }),
    ).toBeChecked();
    expect(
      within(pickerAfter).getByRole('radio', {
        name: 'file-b',
        hidden: true,
      }),
    ).not.toBeChecked();
    expect(pickerAfter).toHaveTextContent(
      enUS.meetings.importingFileHint.replace('{{recordFileId}}', 'file-a'),
    );
    expect(
      await screen.findByRole('dialog', { name: '998877 · file-b' }),
    ).toBeVisible();
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' && call.path === 'meetings/meeting-1/imports',
      ),
    ).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.method === 'GET' &&
          call.path === 'meetings/meeting-1/recordings/file-b/detail',
      ),
    ).toBe(true);
  });
});
