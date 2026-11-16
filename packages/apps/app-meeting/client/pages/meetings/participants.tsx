import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { useParams } from 'react-router';

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

  if (participants.error) {
    return (
      <p className='text-sm text-destructive'>{t('meetings.unavailable')}</p>
    );
  }
  if (participants.loading && !rows.length) {
    return (
      <p className='text-sm text-muted-foreground'>{t('meetings.loading')}</p>
    );
  }
  if (!rows.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('meetings.participantsEmpty')}
      </p>
    );
  }
  return (
    <ul className='flex max-w-xl flex-col gap-2'>
      {rows.map((row) => (
        <li key={row.id} className='rounded-lg border p-3'>
          <p className='font-medium'>
            {row.displayName?.trim() || t('meetings.notProvided')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {row.department ?? t('meetings.notProvided')}
            {row.joinedAt
              ? ` · ${new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(row.joinedAt))}`
              : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
