import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import {
  MeetingEmptyState,
  MeetingLoading,
  MeetingUnavailable,
} from './meeting-feedback.js';
import {
  ParticipantsTable,
  type ParticipantRow,
} from './participants-table.js';

export default function MeetingParticipantsPage(): ReactElement {
  const { t } = useTranslation();
  const { meetingId = '' } = useParams();
  const participants = useListData<{
    data: ParticipantRow[];
    meta: { total: number };
  }>(`meetings/${meetingId}/participants`, { scopes: ['meetings'] });
  const rows = participants.data?.data ?? [];

  if (participants.error) {
    return <MeetingUnavailable onRetry={() => participants.reload()} />;
  }
  if (participants.loading && !rows.length) {
    return <MeetingLoading />;
  }
  if (!rows.length) {
    return <MeetingEmptyState title={t('meetings.participantsEmpty')} />;
  }
  return <ParticipantsTable rows={rows} />;
}
