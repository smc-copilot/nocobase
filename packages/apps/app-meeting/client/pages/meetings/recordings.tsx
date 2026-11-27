import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { StatusBadge } from '#components/status-badge';
import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, type ReactElement } from 'react';
import { useParams } from 'react-router';
import {
  MeetingEmptyState,
  MeetingLoading,
  MeetingUnavailable,
} from './meeting-feedback.js';

interface RecordingRow {
  id: string;
  available: boolean;
  format: string | null;
  unavailableReason: string | null;
}

export default function MeetingRecordingsPage(): ReactElement {
  const { t } = useTranslation();
  const { meetingId = '' } = useParams();
  const recordings = useListData<{
    data: RecordingRow[];
    meta: { total: number };
  }>(`meetings/${meetingId}/recordings`, { scopes: ['meetings'] });
  const rows = recordings.data?.data ?? [];
  const columns = useMemo<ColumnDef<RecordingRow>[]>(
    () => [
      {
        accessorKey: 'available',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.recordings')}
          />
        ),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.available ? 'success' : 'neutral'}>
            {row.original.available
              ? t('meetings.recordingAvailable')
              : t('meetings.recordingUnavailable')}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'format',
        header: t('meetings.recordingFormat'),
        enableSorting: false,
        cell: ({ row }) => row.original.format ?? t('meetings.notProvided'),
      },
      {
        accessorKey: 'unavailableReason',
        header: t('meetings.recordingReason'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.unavailableReason ?? t('meetings.notProvided'),
      },
    ],
    [t],
  );

  if (recordings.error) {
    return <MeetingUnavailable onRetry={() => recordings.reload()} />;
  }
  if (recordings.loading && !rows.length) {
    return <MeetingLoading />;
  }
  if (!rows.length) {
    return <MeetingEmptyState title={t('meetings.recordingsEmpty')} />;
  }
  return (
    <div className='overflow-x-auto'>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={t('meetings.recordingsEmpty')}
        pagination={rows.length > 20}
      />
    </div>
  );
}
