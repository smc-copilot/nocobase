import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MeetingOaPage from '../../client/pages/meetings/oa.js';
import MeetingOperationPage from '../../client/pages/meetings/operation.js';
import MeetingReconciliationPage from '../../client/pages/meetings/reconciliation.js';

function grantPages() {
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

describe('OA workspace page', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(): void {
          this.callback([], this as unknown as ResizeObserver);
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
      getRandomValues: (buffer: Uint8Array) => buffer.fill(1),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves a draft without posting an OA operation', async () => {
    const posted: { path: string; method?: string }[] = [];
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId/oa' element={<MeetingOaPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/oa',
        fetch: answerApi(async ({ path, method }) => {
          posted.push({ path, method });
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/identity') {
            return {
              data: {
                userId: 'u1',
                employeeNo: null,
                canSync: false,
                denyReason: 'OA_MAPPING_MISSING',
                liveVerified: false,
                liveVerifyReason: null,
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method !== 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 1,
                title: 'Draft meeting',
                startAt: null,
                endAt: null,
                location: null,
                summary: 'Minutes',
                tasks: [],
                filledFromContentVersion: 0,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method === 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 2,
                title: 'Draft meeting',
                summary: 'Minutes',
                tasks: [],
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'Minutes', source: 'local' },
                sourceTodos: [{ title: 'Source todo', description: '' }],
                localMinutesEdited: true,
                importStatus: 'empty',
                lastImportError: null,
                liveGatewayImport: 'unavailable',
              },
            };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('textbox', {
        name: enUS.meetingOa.fields.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.meetingOa.isolationBanner)).toBeVisible();
    expect(screen.getByText(enUS.meetingOa.mappingMissing)).toBeVisible();
    expect(
      screen.getByText(enUS.meetingOa.sourceTodosNotAssigned),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.saveDraft }),
    );
    expect(
      posted.some(
        (call) =>
          call.path === 'meetings/meet-1/oa-draft' && call.method === 'PUT',
      ),
    ).toBe(true);
    expect(posted.some((call) => call.path === 'meetingOa/operations')).toBe(
      false,
    );
  });

  it('persists the current editor state before submitting OA sync', async () => {
    const posted: { path: string; method?: string; json?: unknown }[] = [];
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId/oa' element={<MeetingOaPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/oa',
        fetch: answerApi(async ({ path, method, json }) => {
          posted.push({ path, method, json });
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/identity') {
            return {
              data: {
                userId: 'u1',
                employeeNo: 'E1001',
                canSync: true,
                denyReason: null,
                liveVerified: true,
                liveVerifyReason: 'verified',
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method !== 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 1,
                title: 'Draft meeting',
                startAt: null,
                endAt: null,
                location: null,
                summary: 'Minutes',
                tasks: [],
                filledFromContentVersion: 0,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method === 'PUT') {
            expect(json).toMatchObject({
              expectedVersion: 1,
              title: 'Edited title',
              summary: 'Minutes',
            });
            return {
              data: {
                meetingId: 'meet-1',
                version: 2,
                title: 'Edited title',
                summary: 'Minutes',
                tasks: [],
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'Minutes', source: 'local' },
                sourceTodos: [],
                localMinutesEdited: false,
                importStatus: 'empty',
                lastImportError: null,
                liveGatewayImport: 'unavailable',
              },
            };
          }
          if (path === 'meetingOa/operations' && method === 'POST') {
            expect(json).toMatchObject({
              meetingId: 'meet-1',
              expectedDraftVersion: 2,
            });
            return { data: { id: 'op-1' } };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('textbox', {
        name: enUS.meetingOa.fields.title,
      }),
    ).toBeInTheDocument();
    await userEvent.clear(
      screen.getByRole('textbox', { name: enUS.meetingOa.fields.title }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.meetingOa.fields.title }),
      'Edited title',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.submitSync }),
    );
    const putIndex = posted.findIndex(
      (call) =>
        call.path === 'meetings/meet-1/oa-draft' && call.method === 'PUT',
    );
    const syncIndex = posted.findIndex(
      (call) => call.path === 'meetingOa/operations' && call.method === 'POST',
    );
    expect(putIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(putIndex);
  });

  it('keeps newly added tasks when submitting OA sync before draft GET reloads', async () => {
    const posted: { path: string; method?: string; json?: unknown }[] = [];
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId/oa' element={<MeetingOaPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/oa',
        fetch: answerApi(async ({ path, method, json }) => {
          posted.push({ path, method, json });
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/identity') {
            return {
              data: {
                userId: 'u1',
                employeeNo: 'E1001',
                canSync: true,
                denyReason: null,
                liveVerified: true,
                liveVerifyReason: 'verified',
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method !== 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 1,
                title: 'Draft meeting',
                startAt: null,
                endAt: null,
                location: null,
                summary: 'Minutes',
                tasks: [],
                filledFromContentVersion: 0,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method === 'PUT') {
            const body = json as {
              expectedVersion: number;
              tasks: { title: string }[];
            };
            return {
              data: {
                meetingId: 'meet-1',
                version: body.expectedVersion + 1,
                title: 'Draft meeting',
                summary: 'Minutes',
                tasks: body.tasks,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'Minutes', source: 'local' },
                sourceTodos: [],
                localMinutesEdited: false,
                importStatus: 'empty',
                lastImportError: null,
                liveGatewayImport: 'unavailable',
              },
            };
          }
          if (path === 'meetingOa/operations' && method === 'POST') {
            return { data: { id: 'op-1' } };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('textbox', {
        name: enUS.meetingOa.fields.title,
      }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.meetingOa.fields.taskTitle }),
      'Assigned follow-up',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.addTask }),
    );
    expect(await screen.findByDisplayValue('Assigned follow-up')).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: enUS.meetingOa.submitSync }),
      ).toBeEnabled();
    });
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.submitSync }),
    );
    await waitFor(() => {
      expect(
        posted.filter(
          (call) =>
            call.path === 'meetings/meet-1/oa-draft' && call.method === 'PUT',
        ),
      ).toHaveLength(2);
    });
    const puts = posted.filter(
      (call) =>
        call.path === 'meetings/meet-1/oa-draft' && call.method === 'PUT',
    );
    expect(puts[0]?.json).toMatchObject({
      expectedVersion: 1,
      tasks: [{ title: 'Assigned follow-up' }],
    });
    expect(puts[1]?.json).toMatchObject({
      expectedVersion: 2,
      tasks: [{ title: 'Assigned follow-up' }],
    });
  });

  it('disables add task while a draft save is in flight', async () => {
    let releasePut: (() => void) | undefined;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId/oa' element={<MeetingOaPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/oa',
        fetch: answerApi(async ({ path, method, json }) => {
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/identity') {
            return {
              data: {
                userId: 'u1',
                employeeNo: 'E1001',
                canSync: true,
                denyReason: null,
                liveVerified: true,
                liveVerifyReason: 'verified',
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method !== 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 1,
                title: 'Draft meeting',
                startAt: null,
                endAt: null,
                location: null,
                summary: 'Minutes',
                tasks: [],
                filledFromContentVersion: 0,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method === 'PUT') {
            await putGate;
            const body = json as {
              expectedVersion: number;
              tasks: { title: string }[];
            };
            return {
              data: {
                meetingId: 'meet-1',
                version: body.expectedVersion + 1,
                title: 'Draft meeting',
                summary: 'Minutes',
                tasks: body.tasks,
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'Minutes', source: 'local' },
                sourceTodos: [],
                localMinutesEdited: false,
                importStatus: 'empty',
                lastImportError: null,
                liveGatewayImport: 'unavailable',
              },
            };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('textbox', {
        name: enUS.meetingOa.fields.title,
      }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.meetingOa.fields.taskTitle }),
      'First task',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.addTask }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: enUS.meetingOa.addTask }),
      ).toBeDisabled();
    });
    expect(
      screen.getByRole('button', { name: enUS.meetingOa.submitSync }),
    ).toBeDisabled();
    releasePut?.();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: enUS.meetingOa.addTask }),
      ).toBeEnabled();
    });
  });

  it('reads an operation without posting a write and records reconcile evidence only', async () => {
    const posted: { path: string; method?: string }[] = [];
    const { unmount } = await renderWithApp(
      <Routes>
        <Route
          path='/meeting-operations/:operationId'
          element={<MeetingOperationPage />}
        />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meeting-operations/op-1',
        fetch: answerApi(async ({ path, method }) => {
          posted.push({ path, method });
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/operations/op-1') {
            return {
              data: {
                id: 'op-1',
                meetingId: 'meet-1',
                status: 'unknown',
                requestId: 'req-1',
                creatorEmployeeNo: 'E1001',
                isolationAdapter: true,
                writesOaOnGet: false,
                steps: [
                  {
                    stepKey: 'createMeeting',
                    status: 'unknown',
                    externalId: null,
                    errorCode: 'OA_TIMEOUT',
                  },
                ],
                tasks: [],
              },
            };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('heading', {
        name: enUS.meetingOa.operationTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.meetingOa.isolationBanner)).toBeVisible();
    expect(screen.getByText('unknown')).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.meetingOa.recover }),
    ).toBeVisible();
    expect(
      posted.some(
        (call) =>
          call.path === 'meetingOa/operations/op-1/resume' ||
          call.path === 'meetingOa/operations/op-1/recover' ||
          call.path === 'meetingOa/operations',
      ),
    ).toBe(false);
    unmount();

    const reconcilePosted: { path: string; method?: string }[] = [];
    await renderWithApp(
      <Routes>
        <Route
          path='/meeting-reconciliation'
          element={<MeetingReconciliationPage />}
        />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meeting-reconciliation',
        fetch: answerApi(async ({ path, method, json }) => {
          reconcilePosted.push({ path, method });
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/operations' && method !== 'POST') {
            return {
              data: [
                {
                  id: 'op-1',
                  meetingId: 'meet-1',
                  status: 'unknown',
                  requestId: 'req-1',
                  isolationAdapter: true,
                },
              ],
            };
          }
          if (path === 'meetingOa/operations/op-1/reconcile') {
            expect(json).toMatchObject({
              conclusion: 'not_sent',
              evidence: 'adapter timeout; no OA id',
            });
            return {
              data: {
                id: 'op-1',
                status: 'unknown',
                requestId: 'req-1',
                isolationAdapter: true,
              },
            };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('heading', {
        name: enUS.meetingOa.reconciliationTitle,
      }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByPlaceholderText(enUS.meetingOa.evidencePlaceholder),
      'adapter timeout; no OA id',
    );
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.markNotSent }),
    );
    expect(
      reconcilePosted.some(
        (call) =>
          call.path === 'meetingOa/operations/op-1/reconcile' &&
          call.method === 'POST',
      ),
    ).toBe(true);
    expect(
      reconcilePosted.some(
        (call) =>
          call.path === 'meetingOa/operations' && call.method === 'POST',
      ),
    ).toBe(false);
    expect(reconcilePosted.some((call) => call.path.endsWith('/recover'))).toBe(
      false,
    );
    expect(
      screen.queryByRole('button', { name: enUS.meetingOa.recover }),
    ).not.toBeInTheDocument();
  });

  it('keeps remote people matches whose employee number does not contain the query', async () => {
    await renderWithApp(
      <Routes>
        <Route path='/meetings/:meetingId/oa' element={<MeetingOaPage />} />
      </Routes>,
      {
        namespace: packageMetadata.name,
        namespaces: { [packageMetadata.name]: enUS },
        route: '/meetings/meet-1/oa',
        fetch: answerApi(async ({ path, method }) => {
          if (path === 'authorization/permissions') return grantPages();
          if (path === 'meetingOa/identity') {
            return {
              data: {
                userId: 'u1',
                employeeNo: 'E1001',
                canSync: true,
                denyReason: null,
                liveVerified: true,
                liveVerifyReason: 'verified',
              },
            };
          }
          if (path === 'meetings/meet-1/oa-draft' && method !== 'PUT') {
            return {
              data: {
                meetingId: 'meet-1',
                version: 1,
                title: 'Draft meeting',
                startAt: null,
                endAt: null,
                location: null,
                summary: 'Minutes',
                tasks: [],
                writesOa: false,
                isolationAdapter: true,
              },
            };
          }
          if (path === 'meetingOa/people') {
            return {
              data: [
                {
                  fd_no: 'E1001',
                  fd_name: 'Zhang San',
                  fd_department: 'R&D',
                },
              ],
            };
          }
          if (path === 'meetings/meet-1/content') {
            return {
              data: {
                minutes: { text: 'Minutes', source: 'local' },
                sourceTodos: [],
                localMinutesEdited: false,
                importStatus: 'empty',
                lastImportError: null,
                liveGatewayImport: 'unavailable',
              },
            };
          }
          if (path.includes('supplementalFiles')) {
            return { data: [], meta: { total: 0, totalBytes: 0 } };
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
      await screen.findByRole('textbox', {
        name: enUS.meetingOa.fields.title,
      }),
    ).toBeInTheDocument();
    const search = screen.getByLabelText(
      `${enUS.meetingOa.fields.attendees}. ${enUS.meetingOa.peopleSearch}`,
    );
    await userEvent.type(search!, 'Zh');
    expect(
      await screen.findByRole('option', {
        name: 'Zhang San (E1001) R&D',
      }),
    ).toBeVisible();
  });

  it.todo('toasts when supplemental file delete fails once upload UI returns');
});
