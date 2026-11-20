import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
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

interface IdentityRow {
  employeeNo: string | null;
  canSync: boolean;
}

interface OaDraftHeader {
  frozen?: boolean;
  operationId?: string | null;
}

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
  const identity = useListData<{ data: IdentityRow }>('meetingOa/identity', {
    scopes: ['meetings'],
  });
  const oaDraft = useListData<{ data: OaDraftHeader }>(
    `meetings/${meetingId}/oa-draft`,
    { scopes: ['meetings'] },
  );
  const row = meeting.data?.data;
  const identityRow = identity.data?.data;
  const operationId = oaDraft.data?.data?.operationId?.trim() || null;
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
        <div className='flex w-full items-start justify-between gap-4'>
          <BackButton className='mt-1.5 shrink-0' />
          <div className='min-w-0 max-w-full text-right sm:max-w-[min(100%,42rem)]'>
            <h1 className='font-heading text-2xl font-semibold tracking-[-0.035em] break-words'>
              {row?.title?.trim() || t('meetings.untitled')}
            </h1>
            <p className='mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm leading-6 text-muted-foreground'>
              {row?.meetingCode ? (
                <span>
                  {t('meetings.meetingCodeLabel', { code: row.meetingCode })}
                </span>
              ) : (
                <span>{t('meetings.detailDescription')}</span>
              )}
              <span aria-hidden='true'>｜</span>
              <span>
                {identityRow?.canSync && identityRow.employeeNo
                  ? t('meetingOa.mappedAs', {
                      employeeNo: identityRow.employeeNo,
                    })
                  : t('meetingOa.oaUnauthorized')}
              </span>
            </p>
            {operationId ? (
              <p className='mt-1 text-sm leading-6'>
                <RecordLink to={`/meeting-operations/${operationId}`}>
                  {t('meetingOa.viewOperation')}
                </RecordLink>
              </p>
            ) : null}
          </div>
        </div>
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
