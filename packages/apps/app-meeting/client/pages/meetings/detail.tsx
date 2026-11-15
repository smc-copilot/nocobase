import { useListData } from '#hooks/use-list-data';
import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import type { MeetingRow } from './index.js';

interface ParticipantRow {
  id: string;
  displayName: string | null;
  department: string | null;
  joinedAt: string | null;
}

interface RecordingRow {
  id: string;
  available: boolean;
  format: string | null;
  unavailableReason: string | null;
}

export default function MeetingDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { meetingId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const meeting = useListData<{ data: MeetingRow }>(`meetings/${meetingId}`, {
    scopes: ['meetings'],
  });
  const participants = useListData<{
    data: ParticipantRow[];
    meta: { total: number };
  }>(`meetings/${meetingId}/participants`, { scopes: ['meetings'] });
  const recordings = useListData<{
    data: RecordingRow[];
    meta: { total: number };
  }>(`meetings/${meetingId}/recordings`, { scopes: ['meetings'] });
  const row = meeting.data?.data;
  const tab = location.pathname.endsWith('/recordings')
    ? 'recordings'
    : location.pathname.endsWith('/participants')
      ? 'participants'
      : location.pathname.endsWith('/oa')
        ? 'oa'
        : 'overview';
  const formatTime = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : t('meetings.notProvided');

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={row?.title?.trim() || t('meetings.untitled')}
          description={t('meetings.detailDescription')}
        />
        {meeting.loading && !row ? (
          <p className='text-sm text-muted-foreground'>
            {t('meetings.loading')}
          </p>
        ) : null}
        {meeting.error ? (
          <Alert variant='destructive'>
            <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
          </Alert>
        ) : null}
        {row ? (
          <>
            <Tabs
              value={tab}
              onValueChange={(next) => {
                if (next === 'participants')
                  void navigate(`/meetings/${meetingId}/participants`);
                else if (next === 'recordings')
                  void navigate(`/meetings/${meetingId}/recordings`);
                else if (next === 'oa')
                  void navigate(`/meetings/${meetingId}/oa`);
                else void navigate(`/meetings/${meetingId}`);
              }}
            >
              <TabsList>
                <TabsTrigger value='overview'>
                  {t('meetings.tabs.overview')}
                </TabsTrigger>
                <TabsTrigger value='participants'>
                  {t('meetings.tabs.participants')}
                </TabsTrigger>
                <TabsTrigger value='recordings'>
                  {t('meetings.tabs.recordings')}
                </TabsTrigger>
                <TabsTrigger value='oa'>{t('meetings.tabs.oa')}</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === 'overview' ? (
              <dl className='grid max-w-xl grid-cols-1 gap-3 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('meetings.columns.meetingCode')}
                  </dt>
                  <dd>{row.meetingCode ?? t('meetings.notProvided')}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('meetings.columns.startedAt')}
                  </dt>
                  <dd>{formatTime(row.startedAt)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('meetings.columns.endedAt')}
                  </dt>
                  <dd>{formatTime(row.endedAt)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('meetings.columns.participants')}
                  </dt>
                  <dd>
                    {t(
                      `meetings.fetchStatus.${row.participantFetchStatus ?? 'not_provided'}`,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('meetings.columns.recordings')}
                  </dt>
                  <dd>
                    {t(
                      `meetings.fetchStatus.${row.recordingFetchStatus ?? 'not_provided'}`,
                    )}
                  </dd>
                </div>
              </dl>
            ) : null}
            {tab === 'participants' ? (
              <ParticipantList
                loading={participants.loading}
                rows={participants.data?.data ?? []}
              />
            ) : null}
            {tab === 'recordings' ? (
              <RecordingList
                loading={recordings.loading}
                rows={recordings.data?.data ?? []}
              />
            ) : null}
          </>
        ) : null}
      </PageContainer>
      <Outlet />
    </RouteChildPage>
  );
}

function ParticipantList({
  loading,
  rows,
}: {
  readonly loading: boolean;
  readonly rows: ParticipantRow[];
}): ReactElement {
  const { t, i18n } = useTranslation();
  if (loading && !rows.length) {
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

function RecordingList({
  loading,
  rows,
}: {
  readonly loading: boolean;
  readonly rows: RecordingRow[];
}): ReactElement {
  const { t } = useTranslation();
  if (loading && !rows.length) {
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
