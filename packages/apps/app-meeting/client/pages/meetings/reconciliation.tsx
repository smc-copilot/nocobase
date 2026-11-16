import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '#components/ui/card';
import { Field, FieldLabel } from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';
import { useListData } from '#hooks/use-list-data';
import { MeetingEmptyState, MeetingLoading } from './meeting-feedback.js';

interface Operation {
  id: string;
  meetingId: string;
  status: string;
  requestId: string;
  isolationAdapter: boolean;
}

function statusTone(
  status: string,
): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'warning';
  if (status === 'unknown' || status === 'partial') return 'info';
  return 'neutral';
}

export default function MeetingReconciliationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useListData<{ data: Operation[] }>('meetingOa/operations', {
    scopes: ['meetings'],
  });
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = request.data?.data ?? [];

  const reconcile = async (
    id: string,
    conclusion: 'not_sent' | 'sent_or_unknown',
  ) => {
    setBusy(true);
    try {
      await api.request({
        path: `meetingOa/operations/${id}/reconcile`,
        method: 'POST',
        json: { conclusion, evidence },
      });
      toaster.show({ type: 'success', title: t('meetingOa.reconcileSaved') });
      request.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetingOa.reconcileFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('meetingOa.reconciliationTitle')}
        description={t('meetingOa.reconciliationDescription')}
      />
      <Alert>
        <AlertDescription>
          {rows.some((row) => row.isolationAdapter)
            ? t('meetingOa.isolationBanner')
            : t('meetingOa.liveWriteBlocked')}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <h2 className='font-heading text-base font-medium'>
            {t('meetingOa.evidenceTitle')}
          </h2>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor='oa-evidence'>
              {t('meetingOa.evidencePlaceholder')}
            </FieldLabel>
            <Textarea
              id='oa-evidence'
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder={t('meetingOa.evidencePlaceholder')}
            />
          </Field>
        </CardContent>
      </Card>
      {request.loading && !rows.length ? (
        <MeetingLoading />
      ) : rows.length === 0 ? (
        <MeetingEmptyState title={t('meetingOa.reconcileEmpty')} />
      ) : (
        <div className='flex flex-col gap-4'>
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='font-medium break-all'>{row.requestId}</p>
                  <RecordLink to={`/meeting-operations/${row.id}`}>
                    {t('meetingOa.operationTitle')}
                  </RecordLink>
                </div>
                <StatusBadge tone={statusTone(row.status)}>
                  {row.status}
                </StatusBadge>
              </CardHeader>
              <CardFooter className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  size='sm'
                  disabled={busy}
                  onClick={() => void reconcile(row.id, 'not_sent')}
                >
                  {t('meetingOa.markNotSent')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => void reconcile(row.id, 'sent_or_unknown')}
                >
                  {t('meetingOa.markUnknown')}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
