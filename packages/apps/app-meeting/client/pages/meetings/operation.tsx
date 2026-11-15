import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { useListData } from '#hooks/use-list-data';

interface Operation {
  id: string;
  meetingId: string;
  status: string;
  requestId: string;
  creatorEmployeeNo: string;
  isolationAdapter: boolean;
  writesOaOnGet: false;
  steps: {
    stepKey: string;
    status: string;
    externalId: string | null;
    errorCode: string | null;
  }[];
  tasks: {
    clientTaskId: string;
    status: string;
    externalTaskId: string | null;
  }[];
}

export default function MeetingOperationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { operationId = '' } = useParams();
  const request = useListData<{ data: Operation }>(
    `meetingOa/operations/${operationId}`,
    { scopes: ['meetings'] },
  );
  const row = request.data?.data;
  const [busy, setBusy] = useState(false);

  const resume = async () => {
    setBusy(true);
    try {
      await api.request({
        path: `meetingOa/operations/${operationId}/resume`,
        method: 'POST',
        json: {},
      });
      request.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetingOa.resumeFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    setBusy(true);
    try {
      await api.request({
        path: `meetingOa/operations/${operationId}/recover`,
        method: 'POST',
        json: {},
      });
      request.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetingOa.recoverFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('meetingOa.operationTitle')}
        description={t('meetingOa.operationDescription')}
      />
      <Alert>
        <AlertDescription>
          {row?.isolationAdapter
            ? t('meetingOa.isolationBanner')
            : t('meetingOa.liveWriteBlocked')}
        </AlertDescription>
      </Alert>
      {request.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
        </Alert>
      ) : null}
      {row ? (
        <dl className='grid max-w-xl grid-cols-1 gap-3 text-sm'>
          <div>
            <dt className='text-muted-foreground'>
              {t('meetingOa.fields.status')}
            </dt>
            <dd>{row.status}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('meetingOa.fields.requestId')}
            </dt>
            <dd>{row.requestId}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('meetingOa.fields.creator')}
            </dt>
            <dd>{row.creatorEmployeeNo}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('meetingOa.fields.steps')}
            </dt>
            <dd>
              <ul>
                {row.steps.map((step) => (
                  <li key={step.stepKey}>
                    {step.stepKey}: {step.status}
                    {step.externalId ? ` · ${step.externalId}` : ''}
                    {step.errorCode ? ` · ${step.errorCode}` : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('meetingOa.fields.tasks')}
            </dt>
            <dd>
              <ul>
                {row.tasks.map((task) => (
                  <li key={task.clientTaskId}>
                    {task.clientTaskId}: {task.status}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      ) : (
        <p className='text-sm text-muted-foreground'>{t('meetings.loading')}</p>
      )}
      <div className='mt-4 flex gap-2'>
        <Button type='button' disabled={busy} onClick={() => void resume()}>
          {t('meetingOa.resume')}
        </Button>
        <Button
          type='button'
          variant='secondary'
          disabled={busy}
          onClick={() => void recover()}
        >
          {t('meetingOa.recover')}
        </Button>
        <Link className='text-sm underline' to='/meeting-reconciliation'>
          {t('meetingOa.reconciliationTitle')}
        </Link>
      </div>
    </PageContainer>
  );
}
