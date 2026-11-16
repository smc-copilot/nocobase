import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import {
  matchPath,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from 'react-router';
import type { MeetingRow } from './index.js';

export default function MeetingDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { meetingId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const parentPath = useResolvedPath('.');
  const isParentEntry = Boolean(
    matchPath({ path: parentPath.pathname, end: true }, location.pathname),
  );
  const meeting = useListData<{ data: MeetingRow }>(`meetings/${meetingId}`, {
    scopes: ['meetings'],
  });
  const row = meeting.data?.data;
  const tab = location.pathname.endsWith('/summary')
    ? 'summary'
    : location.pathname.endsWith('/recordings')
      ? 'recordings'
      : location.pathname.endsWith('/participants')
        ? 'participants'
        : 'oa';

  if (isParentEntry && meeting.error) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={t('meetings.unavailable')}
            description={t('meetings.detailDescription')}
          />
          <Alert variant='destructive'>
            <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
          </Alert>
          <Button
            type='button'
            variant='outline'
            onClick={() => meeting.reload()}
          >
            {t('meetings.retry')}
          </Button>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (isParentEntry && meeting.loading && !row) {
    return (
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <p className='text-sm text-muted-foreground'>
            {t('meetings.loading')}
          </p>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (isParentEntry) {
    return (
      <Navigate to={{ pathname: 'oa', search: location.search }} replace />
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={row?.title?.trim() || t('meetings.untitled')}
          description={t('meetings.detailDescription')}
        />
        {row?.meetingCode ? (
          <p className='text-sm text-muted-foreground'>
            {t('meetings.meetingCodeLabel', { code: row.meetingCode })}
          </p>
        ) : null}
        {meeting.error ? (
          <Alert variant='destructive'>
            <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
          </Alert>
        ) : null}
        <Tabs
          value={tab}
          onValueChange={(next) => {
            void navigate({
              pathname: `/meetings/${meetingId}/${next}`,
              search: location.search,
            });
          }}
        >
          <TabsList className='h-auto max-w-full flex-wrap justify-start overflow-x-auto'>
            <TabsTrigger value='oa'>{t('meetings.tabs.oa')}</TabsTrigger>
            <TabsTrigger value='participants'>
              {t('meetings.tabs.participants')}
            </TabsTrigger>
            <TabsTrigger value='recordings'>
              {t('meetings.tabs.recordings')}
            </TabsTrigger>
            <TabsTrigger value='summary'>
              {t('meetings.tabs.summary')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Outlet />
      </PageContainer>
    </RouteChildPage>
  );
}
