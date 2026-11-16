import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { useParams } from 'react-router';

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

  if (recordings.error) {
    return (
      <p className='text-sm text-destructive'>{t('meetings.unavailable')}</p>
    );
  }
  if (recordings.loading && !rows.length) {
    return (
      <p className='text-sm text-muted-foreground'>{t('meetings.loading')}</p>
    );
  }
  if (!rows.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('meetings.recordingsEmpty')}
      </p>
    );
  }
  return (
    <ul className='flex max-w-xl flex-col gap-2'>
      {rows.map((row) => (
        <li key={row.id} className='rounded-lg border p-3'>
          <p className='font-medium'>
            {row.available
              ? t('meetings.recordingAvailable')
              : t('meetings.recordingUnavailable')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {row.format ?? t('meetings.notProvided')}
            {row.unavailableReason ? ` · ${row.unavailableReason}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
