import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { resolveListState } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DatePicker } from '#components/date-picker';
import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldError, FieldLabel } from '#components/ui/field';
import { ListFeedback } from '#components/list-feedback';
import { useListData } from '#hooks/use-list-data';
import { useListLocation } from '#hooks/use-list-location';
import { Outlet } from 'react-router';
import {
  readTableUrlState,
  useTableUrlState,
} from '#hooks/use-table-url-state';
import { SearchIcon } from 'lucide-react';
import {
  formatBeijingInstant,
  formatWallDate,
  parseWallDate,
} from './oa-time.js';
import {
  ParticipantsTable,
  type ParticipantRow,
} from './participants-table.js';
import { RecordingDetailDrawer } from './recording-detail-drawer.js';

const STATE_KEY = 'meeting-gateway-oauth-state';

export interface MeetingRow {
  id: string;
  title: string | null;
  meetingCode: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  participantFetchStatus?: string;
  recordingFetchStatus?: string;
  queryAnomaly?: string | null;
  importState?: string;
  oaMeetingCreated?: boolean;
  createdAt: string;
}

interface GatewayConfig {
  contractReady: boolean;
  missingContract: readonly string[];
}

interface GatewayBinding {
  id: string;
  status: string;
  connectionName: string | null;
}

interface RecordingRow {
  id: string;
  recordFileId: string;
  available: boolean;
  sharingUrl: string | null;
  allowDownload: boolean | null;
  importability: string;
  unavailableReason: string | null;
}

interface ImportRunRow {
  id: string;
  meetingId: string;
  recordFileId: string;
  status: string;
  errorCode: string | null;
  createdAt: string;
}

interface DetailRequest {
  source: 'picker' | 'recordings';
  meetingId: string;
  meetingCode: string;
  recordFileId: string;
  allowDownload: boolean | null;
}

function defaultQuarter(): { startedAt: string; endedAt: string } {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const [yearText, monthText] = stamp.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    startedAt: `${year}-${pad(startMonth)}-01`,
    endedAt: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

export interface MeetingList {
  data: MeetingRow[];
  meta: { page: number; pageSize: number; total: number };
}

const MEETING_TABLE = {
  defaultPageSize: 20,
  pageSizeOptions: [20, 50, 100],
  sortColumns: [] as const,
};

export default function MeetingsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { can: canQuery } = useCan({
    resource: { type: 'composite', id: 'meeting' },
    action: 'query',
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'meeting' },
    action: 'manageConnections',
  });
  const quarter = useMemo(() => defaultQuarter(), []);
  const [startedAt, setStartedAt] = useState(quarter.startedAt);
  const [endedAt, setEndedAt] = useState(quarter.endedAt);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string>();
  const [loginBusy, setLoginBusy] = useState(false);
  const [config, setConfig] = useState<GatewayConfig>();
  const [binding, setBinding] = useState<GatewayBinding>();
  const [tasks, setTasks] = useState<ImportRunRow[]>([]);
  const [pickerMeeting, setPickerMeeting] = useState<MeetingRow | null>(null);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>();
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<string>();
  const [participantsMeeting, setParticipantsMeeting] =
    useState<MeetingRow | null>(null);
  const [participantRows, setParticipantRows] = useState<ParticipantRow[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string>();
  const participantsSeqRef = useRef(0);
  const [recordingsListMeeting, setRecordingsListMeeting] =
    useState<MeetingRow | null>(null);
  const [recordingsList, setRecordingsList] = useState<RecordingRow[]>([]);
  const [recordingsListBusy, setRecordingsListBusy] = useState(false);
  const [recordingsListError, setRecordingsListError] = useState<string>();
  const recordingsSeqRef = useRef(0);
  const [detail, setDetail] = useState<DetailRequest | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { active, params } = useListLocation();
  const { paginationState } = readTableUrlState(params, MEETING_TABLE);
  const page = paginationState.pageIndex + 1;
  const pageSize = paginationState.pageSize;
  const requestPath = `meetings?page=${page}&pageSize=${pageSize}`;
  const request = useListData<MeetingList>(requestPath, {
    active,
    keepPreviousData: true,
    scopes: ['meetings'],
  });
  const rows = request.data?.data ?? [];
  const hasCurrentResponse = request.path === requestPath;
  const tableState = useTableUrlState({
    ...MEETING_TABLE,
    active,
    revision: request.revision,
    rowCount:
      hasCurrentResponse && !request.loading && !request.error
        ? request.data?.meta.total
        : undefined,
  });
  const listState = resolveListState(
    {
      data: hasCurrentResponse ? request.data : undefined,
      error: tableState.error ?? request.error,
      isPending: request.loading && !hasCurrentResponse,
    },
    hasCurrentResponse ? (request.data?.meta.total ?? rows.length) : 0,
    false,
  );

  const refreshGateway = useCallback(async () => {
    try {
      const [configRes, bindingRes, tasksRes] = await Promise.all([
        api.request<{ data: GatewayConfig }>({
          path: 'meetingGateway/config',
          method: 'GET',
        }),
        api.request<{ data: GatewayBinding }>({
          path: 'meetingGateway/bindings',
          method: 'GET',
        }),
        api.request<{ data: ImportRunRow[] }>({
          path: 'meetingImportRuns',
          method: 'GET',
        }),
      ]);
      setConfig(configRes.data);
      setBinding(bindingRes.data);
      setTasks(tasksRes.data ?? []);
    } catch {
      // Keep the page usable when gateway settings are unavailable.
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void refreshGateway();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshGateway]);

  const contractReady = config?.contractReady === true;
  const loggedIn = binding?.status === 'active';
  const canRunQuery = Boolean(canQuery && contractReady && loggedIn);

  const openPicker = useCallback(
    async (meeting: MeetingRow) => {
      if (meeting.importState === 'importing') {
        toaster.show({ type: 'warning', title: t('meetings.importWait') });
        return;
      }
      setPickerMeeting(meeting);
      setSelectedFileId(undefined);
      setPickerError(undefined);
      setRecordings([]);
      setPickerBusy(true);
      try {
        const result = await api.request<{ data: RecordingRow[] }>({
          path: `meetings/${meeting.id}/recordings`,
          method: 'GET',
        });
        setRecordings(result.data ?? []);
      } catch (error) {
        setRecordings([]);
        setPickerError(
          error instanceof ApiClientError
            ? error.message
            : t('meetings.queryFailed'),
        );
      } finally {
        setPickerBusy(false);
      }
    },
    [api, t, toaster],
  );

  const loadParticipants = useCallback(
    async (meeting: MeetingRow) => {
      recordingsSeqRef.current += 1;
      setRecordingsListMeeting(null);
      setDetail((current) =>
        current?.source === 'recordings' ? null : current,
      );
      const seq = ++participantsSeqRef.current;
      setParticipantsMeeting(meeting);
      setParticipantRows([]);
      setParticipantsError(undefined);
      setParticipantsLoading(true);
      try {
        const result = await api.request<{ data: ParticipantRow[] }>({
          path: `meetings/${meeting.id}/participants`,
          method: 'GET',
        });
        if (seq !== participantsSeqRef.current) return;
        setParticipantRows(result.data ?? []);
      } catch (error) {
        if (seq !== participantsSeqRef.current) return;
        setParticipantRows([]);
        setParticipantsError(
          error instanceof ApiClientError
            ? error.message
            : t('meetings.participantsFailed'),
        );
      } finally {
        if (seq === participantsSeqRef.current) setParticipantsLoading(false);
      }
    },
    [api, t],
  );

  const openRecordingsList = useCallback(
    async (meeting: MeetingRow) => {
      participantsSeqRef.current += 1;
      setParticipantsMeeting(null);
      setParticipantsLoading(false);
      setDetail((current) =>
        current?.source === 'recordings' ? null : current,
      );
      const seq = ++recordingsSeqRef.current;
      setRecordingsListMeeting(meeting);
      setRecordingsList([]);
      setRecordingsListError(undefined);
      setRecordingsListBusy(true);
      try {
        const result = await api.request<{ data: RecordingRow[] }>({
          path: `meetings/${meeting.id}/recordings`,
          method: 'GET',
        });
        if (seq !== recordingsSeqRef.current) return;
        setRecordingsList(result.data ?? []);
      } catch (error) {
        if (seq !== recordingsSeqRef.current) return;
        setRecordingsList([]);
        setRecordingsListError(
          error instanceof ApiClientError
            ? error.message
            : t('meetings.queryFailed'),
        );
      } finally {
        if (seq === recordingsSeqRef.current) setRecordingsListBusy(false);
      }
    },
    [api, t],
  );

  const closePicker = () => {
    setPickerMeeting(null);
    setDetail((current) => (current?.source === 'picker' ? null : current));
  };

  const closeDetail = () => {
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    setDetail(null);
    if (!trigger) return;
    requestAnimationFrame(() => {
      if (trigger.isConnected) trigger.focus();
    });
  };

  const openRecordingDetail = (
    source: DetailRequest['source'],
    meeting: MeetingRow,
    file: RecordingRow,
    trigger: HTMLButtonElement,
  ) => {
    detailTriggerRef.current = trigger;
    setDetail({
      source,
      meetingId: meeting.id,
      meetingCode: meeting.meetingCode ?? '',
      recordFileId: String(file.recordFileId),
      allowDownload: file.allowDownload,
    });
  };

  const confirmImport = async () => {
    if (!pickerMeeting || !selectedFileId) return;
    setPickerBusy(true);
    try {
      await api.request({
        path: `meetings/${pickerMeeting.id}/imports`,
        method: 'POST',
        json: { recordFileId: selectedFileId },
      });
      closePicker();
      request.reload?.();
      await refreshGateway();
    } catch (error) {
      setPickerError(
        error instanceof ApiClientError
          ? error.message
          : t('meetings.queryFailed'),
      );
    } finally {
      setPickerBusy(false);
    }
  };

  const columns = useMemo<ColumnDef<MeetingRow>[]>(
    () => [
      {
        accessorKey: 'startedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.startedAt')}
          />
        ),
        cell: ({ row }) => formatBeijingInstant(row.original.startedAt),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <RecordLink to={`/meetings/${row.original.id}`}>
            {row.original.title?.trim() || t('meetings.untitled')}
          </RecordLink>
        ),
      },
      {
        accessorKey: 'meetingCode',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.meetingCode')}
          />
        ),
        cell: ({ row }) =>
          row.original.queryAnomaly
            ? row.original.queryAnomaly
            : (row.original.meetingCode ?? t('meetings.notProvided')),
      },
      {
        id: 'participants',
        header: t('meetings.columns.participants'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.participantFetchStatus === 'fetched' ? (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto px-1'
              onClick={() => void loadParticipants(row.original)}
            >
              {t('meetings.viewParticipants')}
            </Button>
          ) : (
            <span className='text-muted-foreground'>
              {t('meetings.participantsUnavailable')}
            </span>
          ),
      },
      {
        id: 'importState',
        header: t('meetings.status'),
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.oaMeetingCreated) {
            return t('meetings.oaMeetingCreated');
          }
          const state = row.original.importState ?? 'not_imported';
          if (state === 'imported') return t('meetings.imported');
          if (state === 'importing') return t('meetings.importing');
          if (state === 'failed') return t('meetings.taskFailed');
          return t('meetings.notProvided');
        },
      },
      {
        id: 'actions',
        header: t('meetings.actions'),
        enableSorting: false,
        cell: ({ row }) => {
          const state = row.original.importState ?? 'not_imported';
          let primary: ReactElement | null = null;
          if (row.original.oaMeetingCreated || state === 'imported') {
            primary = (
              <RecordLink to={`/meetings/${row.original.id}`}>
                {t('meetings.viewMeeting')}
              </RecordLink>
            );
          } else if (state === 'importing') {
            primary = (
              <Button type='button' size='sm' disabled>
                {t('meetings.importing')}
              </Button>
            );
          } else if (loggedIn) {
            primary = (
              <Button
                type='button'
                size='sm'
                onClick={() => void openPicker(row.original)}
              >
                {state === 'failed'
                  ? t('meetings.taskRetry')
                  : t('meetings.import')}
              </Button>
            );
          }
          return (
            <div className='flex flex-wrap items-center gap-2'>
              {primary}
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => void openRecordingsList(row.original)}
              >
                {t('meetings.recordingDetails')}
              </Button>
            </div>
          );
        },
      },
    ],
    [loadParticipants, loggedIn, openPicker, openRecordingsList, t],
  );

  const startLogin = async () => {
    setLoginBusy(true);
    try {
      const result = await api.request<{
        data: { authorizationUrl: string; state: string };
      }>({
        path: 'meetingGateway/bindings/start',
        method: 'POST',
      });
      sessionStorage.setItem(STATE_KEY, result.data.state);
      window.location.assign(result.data.authorizationUrl);
    } catch {
      toaster.show({ type: 'error', title: t('meetings.loginFailed') });
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    if (!binding?.id || binding.id === 'none') return;
    setLoginBusy(true);
    try {
      await api.request({
        path: `meetingGateway/bindings/${binding.id}/disconnect`,
        method: 'POST',
        json: {},
      });
      await refreshGateway();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetings.loginFailed'),
      });
    } finally {
      setLoginBusy(false);
    }
  };

  const runQuery = async () => {
    if (startedAt > endedAt) {
      setQueryError(t('meetings.queryWindowInvalid'));
      return;
    }
    setQueryBusy(true);
    setQueryError(undefined);
    try {
      await api.request({
        path: 'meetingQueryRuns',
        method: 'POST',
        json: {
          startedAt: `${startedAt}T00:00:00+08:00`,
          endedAt: `${endedAt}T23:59:59.999+08:00`,
        },
      });
      toaster.show({ type: 'success', title: t('meetings.queryStarted') });
      request.reload?.();
      await refreshGateway();
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.reason : undefined;
      if (
        reason === 'QUERY_RESULT_UNKNOWN' ||
        reason === 'UPSTREAM_CONTRACT_ERROR'
      ) {
        setQueryError(t('meetings.queryRetryLater'));
      } else {
        setQueryError(
          reason
            ? `${t('meetings.queryFailed')} (${reason})`
            : t('meetings.queryFailed'),
        );
      }
    } finally {
      setQueryBusy(false);
    }
  };

  const retryTask = async (task: ImportRunRow) => {
    try {
      await api.request({
        path: `meetings/${task.meetingId}/imports`,
        method: 'POST',
        json: { recordFileId: task.recordFileId },
      });
      request.reload?.();
      await refreshGateway();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetings.queryFailed'),
      });
    }
  };

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('meetings.title')}
          description={t('meetings.listDescription')}
          actions={
            contractReady && canManage && !loggedIn ? (
              <Button
                type='button'
                disabled={loginBusy}
                onClick={() => void startLogin()}
              >
                {t('meetings.loginTencent')}
              </Button>
            ) : loggedIn ? (
              <>
                <StatusBadge tone='success' size='sm'>
                  {t('meetings.loggedIn')}
                  {binding?.connectionName
                    ? ` · ${binding.connectionName}`
                    : ''}
                </StatusBadge>
                {canManage ? (
                  <Button
                    type='button'
                    variant='outline'
                    disabled={loginBusy}
                    onClick={() => void logout()}
                  >
                    {t('meetings.logout')}
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        />
        {!contractReady ? (
          <Alert>
            <AlertDescription>
              {t('meetings.gatewayNotConfigured')}
              {config?.missingContract?.length
                ? ` (${config.missingContract.join(', ')})`
                : ''}
            </AlertDescription>
          </Alert>
        ) : null}
        {contractReady && !loggedIn ? (
          <Alert>
            <AlertDescription>{t('meetings.loginHint')}</AlertDescription>
          </Alert>
        ) : null}
        {canQuery ? (
          <form
            className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end'
            onSubmit={(event) => {
              event.preventDefault();
              void runQuery();
            }}
          >
            <Field className='sm:max-w-56'>
              <FieldLabel htmlFor='meeting-query-start'>
                {t('meetings.queryStart')}
              </FieldLabel>
              <DatePicker
                id='meeting-query-start'
                value={parseWallDate(startedAt)}
                onChange={(date) =>
                  setStartedAt(formatWallDate(date) || startedAt)
                }
              />
            </Field>
            <Field className='sm:max-w-56'>
              <FieldLabel htmlFor='meeting-query-end'>
                {t('meetings.queryEnd')}
              </FieldLabel>
              <DatePicker
                id='meeting-query-end'
                value={parseWallDate(endedAt)}
                onChange={(date) => setEndedAt(formatWallDate(date) || endedAt)}
              />
            </Field>
            <Button type='submit' disabled={queryBusy || !canRunQuery}>
              <SearchIcon />
              {t('meetings.query')}
            </Button>
            {queryError ? <FieldError>{queryError}</FieldError> : null}
          </form>
        ) : null}
        <p className='text-sm text-muted-foreground'>
          {t('meetings.queryNotConnected')}
        </p>
        <ListFeedback
          state={listState}
          identity={requestPath}
          empty={
            <p className='text-sm text-muted-foreground'>
              {t('meetings.empty')}
            </p>
          }
        >
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            manualPagination
            rowCount={request.data?.meta.total ?? 0}
            {...tableState}
            showSelectedCount={false}
            emptyMessage={t('meetings.empty')}
            renderCard={(row) => (
              <div className='rounded-lg border p-4'>
                <p className='font-medium'>
                  <RecordLink to={`/meetings/${row.original.id}`}>
                    {row.original.title?.trim() || t('meetings.untitled')}
                  </RecordLink>
                </p>
                <p className='text-sm text-muted-foreground'>
                  {row.original.meetingCode ?? t('meetings.notProvided')}
                </p>
              </div>
            )}
          />
        </ListFeedback>
        {tasks.length > 0 ? (
          <section className='space-y-2'>
            <h2 className='text-base font-medium'>
              {t('meetings.importTasks')}
            </h2>
            <ul className='space-y-2'>
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className='flex flex-wrap items-center gap-2 rounded border p-2 text-sm'
                >
                  <span>{task.recordFileId}</span>
                  <StatusBadge
                    tone={
                      task.status === 'succeeded'
                        ? 'success'
                        : task.status === 'failed'
                          ? 'warning'
                          : 'info'
                    }
                    size='sm'
                  >
                    {task.status === 'succeeded'
                      ? t('meetings.taskSucceeded')
                      : task.status === 'failed'
                        ? t('meetings.taskFailed')
                        : task.status === 'running'
                          ? t('meetings.taskRunning')
                          : t('meetings.taskCreated')}
                  </StatusBadge>
                  {task.errorCode ? (
                    <span className='text-muted-foreground'>
                      {task.errorCode}
                    </span>
                  ) : null}
                  {task.status === 'failed' ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => void retryTask(task)}
                    >
                      {t('meetings.taskRetry')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Dialog
          open={participantsMeeting !== null}
          onOpenChange={(next) => {
            if (next) return;
            participantsSeqRef.current += 1;
            setParticipantsMeeting(null);
            setParticipantsLoading(false);
          }}
        >
          <DialogContent className='sm:max-w-4xl'>
            <DialogHeader>
              <DialogTitle>
                {t('meetings.viewParticipantsTitle', {
                  title:
                    participantsMeeting?.title?.trim() ||
                    t('meetings.untitled'),
                  code:
                    participantsMeeting?.meetingCode ||
                    t('meetings.notProvided'),
                })}
              </DialogTitle>
              <DialogDescription>
                {t('meetings.participantsTitle')}
              </DialogDescription>
            </DialogHeader>
            <ParticipantsTable
              rows={participantRows}
              loading={participantsLoading}
              error={participantsError}
              empty={
                <p className='text-sm text-muted-foreground'>
                  {t('meetings.participantsEmpty')}
                </p>
              }
              onRetry={() => {
                if (participantsMeeting) {
                  void loadParticipants(participantsMeeting);
                }
              }}
            />
          </DialogContent>
        </Dialog>
        <Dialog
          open={recordingsListMeeting !== null}
          onOpenChange={(next) => {
            if (next) return;
            recordingsSeqRef.current += 1;
            setRecordingsListMeeting(null);
            setRecordingsListBusy(false);
            setDetail((current) =>
              current?.source === 'recordings' ? null : current,
            );
          }}
        >
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>
                {t('meetings.recordingListTitle', {
                  code:
                    recordingsListMeeting?.meetingCode ||
                    recordingsListMeeting?.id ||
                    t('meetings.notProvided'),
                })}
              </DialogTitle>
              <DialogDescription>
                {t('meetings.viewRecordings')}
              </DialogDescription>
            </DialogHeader>
            {recordingsListError ? (
              <Alert variant='destructive'>
                <AlertDescription>{recordingsListError}</AlertDescription>
              </Alert>
            ) : null}
            {recordingsListBusy && recordingsList.length === 0 ? (
              <p className='text-sm'>{t('meetings.loading')}</p>
            ) : null}
            {!recordingsListBusy &&
            !recordingsListError &&
            recordingsList.length === 0 ? (
              <p className='text-sm'>{t('meetings.recordingsEmpty')}</p>
            ) : null}
            <ul className='space-y-2'>
              {recordingsList.map((file) => (
                <li
                  key={file.recordFileId}
                  className='flex flex-wrap items-center gap-3 rounded border p-2 text-sm'
                >
                  <span>{file.recordFileId}</span>
                  {file.sharingUrl ? (
                    <a
                      href={file.sharingUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='underline'
                    >
                      {t('meetings.openSharing')}
                    </a>
                  ) : (
                    <span>{t('meetings.na')}</span>
                  )}
                  <span>
                    {file.allowDownload === true
                      ? t('meetings.allowDownloadYes')
                      : file.allowDownload === false
                        ? t('meetings.allowDownloadNo')
                        : t('meetings.allowDownloadUnknown')}
                  </span>
                  {recordingsListMeeting ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={(event) =>
                        openRecordingDetail(
                          'recordings',
                          recordingsListMeeting,
                          file,
                          event.currentTarget,
                        )
                      }
                    >
                      {t('meetings.viewDetail')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  recordingsSeqRef.current += 1;
                  setRecordingsListMeeting(null);
                  setDetail((current) =>
                    current?.source === 'recordings' ? null : current,
                  );
                }}
              >
                {t('meetings.cancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
          {detail?.source === 'recordings' ? (
            <RecordingDetailDrawer
              open
              onOpenChange={(next) => {
                if (!next) closeDetail();
              }}
              meetingId={detail.meetingId}
              meetingCode={detail.meetingCode}
              recordFileId={detail.recordFileId}
              allowDownload={detail.allowDownload}
            />
          ) : null}
        </Dialog>
        <Dialog
          open={pickerMeeting !== null}
          onOpenChange={(next) => {
            if (!next) closePicker();
          }}
        >
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>
                {t('meetings.importPickTitle', {
                  code:
                    pickerMeeting?.meetingCode ||
                    pickerMeeting?.id ||
                    t('meetings.notProvided'),
                })}
              </DialogTitle>
              <DialogDescription>
                {t('meetings.importPickHint')}
              </DialogDescription>
            </DialogHeader>
            <p className='text-sm'>
              {t('meetings.importingFileHint', {
                recordFileId: selectedFileId ?? t('meetings.notProvided'),
              })}
            </p>
            {pickerError ? (
              <Alert variant='destructive'>
                <AlertDescription>{pickerError}</AlertDescription>
              </Alert>
            ) : null}
            {pickerBusy && recordings.length === 0 ? (
              <p className='text-sm'>{t('meetings.loading')}</p>
            ) : null}
            {!pickerBusy && !pickerError && recordings.length === 0 ? (
              <p className='text-sm'>{t('meetings.importNoFiles')}</p>
            ) : null}
            <ul className='space-y-2'>
              {recordings.map((file) => {
                const selectable =
                  file.importability === 'importable' ||
                  file.importability === 'unknown';
                return (
                  <li
                    key={file.recordFileId}
                    className='flex flex-wrap items-center gap-3 rounded border p-2 text-sm'
                  >
                    <input
                      type='radio'
                      name='recording'
                      aria-label={file.recordFileId}
                      disabled={!selectable}
                      checked={selectedFileId === file.recordFileId}
                      onChange={() => setSelectedFileId(file.recordFileId)}
                    />
                    <span>{file.recordFileId}</span>
                    {file.sharingUrl ? (
                      <a
                        href={file.sharingUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='underline'
                      >
                        {t('meetings.openSharing')}
                      </a>
                    ) : (
                      <span>{t('meetings.na')}</span>
                    )}
                    <span>
                      {file.allowDownload === true
                        ? t('meetings.allowDownloadYes')
                        : file.allowDownload === false
                          ? t('meetings.allowDownloadNo')
                          : t('meetings.allowDownloadUnknown')}
                    </span>
                    <span>
                      {file.importability === 'importable'
                        ? t('meetings.importabilityImportable')
                        : file.importability === 'unknown'
                          ? t('meetings.importabilityUnknown')
                          : t('meetings.importabilityBlocked')}
                    </span>
                    {pickerMeeting ? (
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={(event) =>
                          openRecordingDetail(
                            'picker',
                            pickerMeeting,
                            file,
                            event.currentTarget,
                          )
                        }
                      >
                        {t('meetings.viewDetail')}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <DialogFooter className='sm:justify-between'>
              <Button
                type='button'
                variant='outline'
                disabled={pickerBusy || !pickerMeeting}
                onClick={() => {
                  if (pickerMeeting) void openPicker(pickerMeeting);
                }}
              >
                {t('meetings.importRecheck')}
              </Button>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  disabled={!selectedFileId || pickerBusy}
                  onClick={() => void confirmImport()}
                >
                  {t('meetings.importConfirm')}
                </Button>
                <Button type='button' variant='ghost' onClick={closePicker}>
                  {t('meetings.cancel')}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
          {detail?.source === 'picker' ? (
            <RecordingDetailDrawer
              open
              onOpenChange={(next) => {
                if (!next) closeDetail();
              }}
              meetingId={detail.meetingId}
              meetingCode={detail.meetingCode}
              recordFileId={detail.recordFileId}
              allowDownload={detail.allowDownload}
            />
          ) : null}
        </Dialog>
      </PageContainer>
      <Outlet />
    </>
  );
}
