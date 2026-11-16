import { DataTable, DataTableColumnHeader } from '#components/data-table';
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

interface ParticipantRow {
  id: string;
  displayName: string | null;
  department: string | null;
  joinedAt: string | null;
}

export default function MeetingParticipantsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { meetingId = '' } = useParams();
  const participants = useListData<{
    data: ParticipantRow[];
    meta: { total: number };
  }>(`meetings/${meetingId}/participants`, { scopes: ['meetings'] });
  const rows = participants.data?.data ?? [];
  const columns = useMemo<ColumnDef<ParticipantRow>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.columns.participants')}
          />
        ),
        cell: ({ row }) =>
          row.original.displayName?.trim() || t('meetings.notProvided'),
      },
      {
        accessorKey: 'department',
        header: t('meetings.department'),
        enableSorting: false,
        cell: ({ row }) => row.original.department ?? t('meetings.notProvided'),
      },
      {
        accessorKey: 'joinedAt',
        header: t('meetings.joinedAt'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.joinedAt
            ? new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(row.original.joinedAt))
            : t('meetings.notProvided'),
      },
    ],
    [i18n.language, t],
  );

  if (participants.error) {
    return <MeetingUnavailable onRetry={() => participants.reload()} />;
  }
  if (participants.loading && !rows.length) {
    return <MeetingLoading />;
  }
  if (!rows.length) {
    return <MeetingEmptyState title={t('meetings.participantsEmpty')} />;
  }
  return (
    <div className='overflow-x-auto'>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={t('meetings.participantsEmpty')}
        pagination={rows.length > 20}
      />
    </div>
  );
}
