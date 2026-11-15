import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { Link } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { useListData } from '#hooks/use-list-data';

interface Operation {
  id: string;
  meetingId: string;
  status: string;
  requestId: string;
  isolationAdapter: boolean;
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
      <Textarea
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        placeholder={t('meetingOa.evidencePlaceholder')}
      />
      {rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.reconcileEmpty')}
        </p>
      ) : (
        <ul className='flex max-w-xl flex-col gap-3'>
          {rows.map((row) => (
            <li key={row.id} className='rounded-lg border p-3 text-sm'>
              <p>
                {row.status} · {row.requestId}
              </p>
              <Link to={`/meeting-operations/${row.id}`}>
                {t('meetingOa.operationTitle')}
              </Link>
              <div className='mt-2 flex flex-wrap gap-2'>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
