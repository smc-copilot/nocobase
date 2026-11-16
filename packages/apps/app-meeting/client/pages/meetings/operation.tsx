import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '#components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useListData } from '#hooks/use-list-data';
import { MeetingLoading, MeetingUnavailable } from './meeting-feedback.js';

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

function statusTone(
  status: string,
): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'warning';
  if (status === 'unknown' || status === 'partial') return 'info';
  return 'neutral';
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

  const meetingCreated = Boolean(
    row?.steps.some(
      (step) => step.stepKey === 'createMeeting' && step.status === 'succeeded',
    ),
  );
  const statusLabel =
    row?.status === 'succeeded'
      ? row.status
      : meetingCreated
        ? t('meetingOa.meetingCreated')
        : (row?.status ?? '');

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
        <MeetingUnavailable onRetry={() => request.reload()} />
      ) : null}
      {row ? (
        <Card>
          <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingOa.fields.status')}
            </h2>
            <StatusBadge tone={statusTone(row.status)}>
              {statusLabel}
            </StatusBadge>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {row.status !== 'succeeded' && meetingCreated ? (
              <Alert>
                <AlertDescription>
                  {t('meetingOa.notFullyComplete')}
                </AlertDescription>
              </Alert>
            ) : null}
            <dl className='grid gap-3 text-sm sm:grid-cols-2'>
              <div>
                <dt className='text-muted-foreground'>
                  {t('meetingOa.fields.requestId')}
                </dt>
                <dd className='break-all'>{row.requestId}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>
                  {t('meetingOa.fields.creator')}
                </dt>
                <dd>{row.creatorEmployeeNo}</dd>
              </div>
            </dl>
            <div className='overflow-x-auto rounded-xl ring-1 ring-foreground/10'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('meetingOa.fields.steps')}</TableHead>
                    <TableHead>{t('meetingOa.fields.status')}</TableHead>
                    <TableHead>{t('meetingOa.externalId')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.steps.map((step) => (
                    <TableRow key={step.stepKey}>
                      <TableCell>{step.stepKey}</TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(step.status)} size='sm'>
                          {`${step.stepKey}: ${step.status}`}
                        </StatusBadge>
                        {step.errorCode ? (
                          <span className='ml-2 text-muted-foreground'>
                            {step.errorCode}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className='break-all'>
                        {step.externalId
                          ? `${
                              step.stepKey === 'uploadSummary'
                                ? t('meetingOa.externalSummaryId')
                                : step.stepKey === 'createMeeting'
                                  ? t('meetingOa.externalMeetingId')
                                  : ''
                            } ${step.externalId}`
                          : t('meetings.notProvided')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className='overflow-x-auto rounded-xl ring-1 ring-foreground/10'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('meetingOa.fields.tasks')}</TableHead>
                    <TableHead>{t('meetingOa.fields.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.tasks.map((task) => (
                    <TableRow key={task.clientTaskId}>
                      <TableCell className='break-all'>
                        {task.clientTaskId}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(task.status)} size='sm'>
                          {task.status}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className='flex flex-wrap gap-2'>
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
            <RecordLink to='/meeting-reconciliation'>
              {t('meetingOa.reconciliationTitle')}
            </RecordLink>
          </CardFooter>
        </Card>
      ) : request.error ? null : (
        <MeetingLoading />
      )}
    </PageContainer>
  );
}
