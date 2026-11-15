import { resolveListState } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { ListFeedback } from '#components/list-feedback';
import { useListData } from '#hooks/use-list-data';
import { useListLocation } from '#hooks/use-list-location';
import { useTableUrlState } from '#hooks/use-table-url-state';

export interface MeetingRow {
  id: string;
  title: string | null;
  meetingCode: string | null;
  createdAt: string;
}

export interface MeetingList {
  data: MeetingRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function MeetingsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { active, params } = useListLocation();
  const page = Number(params.get('page') ?? '1') || 1;
  const pageSize = Number(params.get('pageSize') ?? '20') || 20;
  const requestPath = `meetings?page=${page}&pageSize=${pageSize}`;
  const request = useListData<MeetingList>(requestPath, {
    active,
    keepPreviousData: true,
    scopes: ['meetings'],
  });
  const rows = request.data?.data ?? [];
  const tableState = useTableUrlState({
    active,
    revision: request.revision,
    sortColumns: [],
    rowCount:
      !request.loading && !request.error && request.path === requestPath
        ? rows.length
        : undefined,
  });
  const listState = resolveListState(
    {
      data: request.data,
      error: request.error,
      isPending: request.loading && !request.data,
    },
    rows.length,
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
        cell: ({ row }) => row.original.title?.trim() || t('meetings.untitled'),
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

  return (
    <PageContainer>
      <PageHeader title={t('meetings.title')} />
      <Alert>
        <AlertDescription>{t('meetings.queryNotConnected')}</AlertDescription>
      </Alert>
      <ListFeedback
        state={listState}
        identity={requestPath}
        empty={
          <p className='text-sm text-muted-foreground'>{t('meetings.empty')}</p>
        }
      >
        <DataTable
          paginationState={tableState.paginationState}
          onPaginationChange={tableState.onPaginationChange}
          pageSizeOptions={[20, 50, 100]}
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
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
  );
}
