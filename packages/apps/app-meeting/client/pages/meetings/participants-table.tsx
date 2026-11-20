import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { Button } from '#components/ui/button';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { formatBeijingInstant } from './oa-time.js';

export interface ParticipantRow {
  id: string;
  joinName?: string | null;
  displayName: string | null;
  department: string | null;
  joinedAt: string | null;
  jobTitle: string | null;
  isCorpMember: boolean | null;
}

function present(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function ParticipantsTable({
  rows,
  loading = false,
  error,
  empty,
  onRetry,
}: {
  readonly rows: ParticipantRow[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly empty?: ReactNode;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<ParticipantRow>[]>(
    () => [
      {
        id: 'joinName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meetings.joinName')}
          />
        ),
        enableSorting: false,
        cell: ({ row }) =>
          present(
            row.original.joinName,
            present(row.original.displayName, t('meetings.na')),
          ),
      },
      {
        accessorKey: 'joinedAt',
        header: t('meetings.joinedAt'),
        enableSorting: false,
        cell: ({ row }) =>
          formatBeijingInstant(row.original.joinedAt, t('meetings.na')),
      },
      {
        accessorKey: 'department',
        header: t('meetings.department'),
        enableSorting: false,
        cell: ({ row }) => present(row.original.department, t('meetings.na')),
      },
      {
        accessorKey: 'jobTitle',
        header: t('meetings.jobTitle'),
        enableSorting: false,
        cell: ({ row }) => present(row.original.jobTitle, t('meetings.na')),
      },
      {
        accessorKey: 'isCorpMember',
        header: t('meetings.corpMember'),
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.isCorpMember === true) {
            return t('meetings.corpMemberYes');
          }
          if (row.original.isCorpMember === false) {
            return t('meetings.corpMemberNo');
          }
          return t('meetings.na');
        },
      },
    ],
    [t],
  );

  if (loading) {
    return <p className='text-sm'>{t('meetings.participantsLoading')}</p>;
  }
  if (error) {
    return (
      <div className='space-y-2'>
        <p className='text-sm'>{error}</p>
        {onRetry ? (
          <Button type='button' size='sm' variant='outline' onClick={onRetry}>
            {t('meetings.retry')}
          </Button>
        ) : null}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <>
        {empty ?? <p className='text-sm'>{t('meetings.participantsEmpty')}</p>}
      </>
    );
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
