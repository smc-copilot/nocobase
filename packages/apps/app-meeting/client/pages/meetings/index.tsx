import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { resolveListState } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { ListFeedback } from '#components/list-feedback';
import { useListData } from '#hooks/use-list-data';
import { useListLocation } from '#hooks/use-list-location';
import { Outlet } from 'react-router';
import {
  readTableUrlState,
  useTableUrlState,
} from '#hooks/use-table-url-state';

export interface MeetingRow {
  id: string;
  title: string | null;
  meetingCode: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  participantFetchStatus?: string;
  recordingFetchStatus?: string;
  createdAt: string;
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
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { can: canQuery } = useCan({
    resource: { type: 'composite', id: 'meeting' },
    action: 'query',
  });
  const quarter = useMemo(() => defaultQuarter(), []);
  const [startedAt, setStartedAt] = useState(quarter.startedAt);
  const [endedAt, setEndedAt] = useState(quarter.endedAt);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string>();
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
  const columns = useMemo<ColumnDef<MeetingRow>[]>(
    () => [
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
          row.original.meetingCode ?? t('meetings.notProvided'),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.createdAt')}
          />
        ),
        cell: ({ row }) =>
          new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(row.original.createdAt)),
      },
    ],
    [i18n.language, t],
  );

  const runQuery = async () => {
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
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.reason : undefined;
      setQueryError(
        reason
          ? `${t('meetings.queryFailed')} (${reason})`
          : t('meetings.queryFailed'),
      );
    } finally {
      setQueryBusy(false);
    }
  };

  return (
    <>
      <PageContainer>
        <PageHeader title={t('meetings.title')} />
        <Alert>
          <AlertDescription>{t('meetings.queryNotConnected')}</AlertDescription>
        </Alert>
        {canQuery ? (
          <form
            className='flex flex-wrap items-end gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void runQuery();
            }}
          >
            <div className='flex flex-col gap-1'>
              <Label htmlFor='meeting-query-start'>
                {t('meetings.queryStart')}
              </Label>
              <Input
                id='meeting-query-start'
                type='date'
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='meeting-query-end'>
                {t('meetings.queryEnd')}
              </Label>
              <Input
                id='meeting-query-end'
                type='date'
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
              />
            </div>
            <Button type='submit' disabled={queryBusy}>
              {t('meetings.query')}
            </Button>
            {queryError ? (
              <p className='text-sm text-destructive'>{queryError}</p>
            ) : null}
          </form>
        ) : null}
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
                  {row.original.title?.trim() || t('meetings.untitled')}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {row.original.meetingCode ?? t('meetings.notProvided')}
                </p>
              </div>
            )}
          />
        </ListFeedback>
      </PageContainer>
      <Outlet />
    </>
  );
}
