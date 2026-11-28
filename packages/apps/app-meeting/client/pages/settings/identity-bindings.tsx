import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';

interface BindingRow {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly localUserId: string;
  readonly username: string | null;
}

interface Preview {
  readonly rows: readonly {
    readonly index: number;
    readonly issuer: string;
    readonly subject: string;
    readonly employeeNo?: string;
    readonly status: 'create' | 'unchanged' | 'conflict';
    readonly conflicts: readonly string[];
    readonly localUserId?: string;
  }[];
  readonly summary: {
    readonly create: number;
    readonly unchanged: number;
    readonly conflict: number;
  };
}

const SAMPLE = `[
  {
    "issuer": "https://sso.example.com",
    "subject": "employee-subject",
    "employeeNo": "E10001"
  }
]`;

export default function IdentityBindingsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const list = useSettingsData<{
    data: readonly BindingRow[];
    meta: { total: number };
  }>('casdoorIdentity/externalIdentities');
  const [draft, setDraft] = useState(SAMPLE);
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);

  const parseRows = () => JSON.parse(draft) as unknown[];

  const run = async (path: 'preview' | 'commit') => {
    setBusy(true);
    try {
      const result = await api.request<{ data: Preview }>({
        path: `casdoorIdentity/externalIdentities/${path}`,
        method: 'POST',
        json: { rows: parseRows() },
      });
      setPreview(result.data);
      if (path === 'commit') {
        toaster.show({
          type: 'success',
          title: t('identity.bindingCommitted'),
        });
        list.reload();
      }
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof Error ? error.message : t('identity.bindingFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('identity.bindings')}
        description={t('identity.bindingsDescription')}
      />
      <Alert>
        <AlertTitle>{t('identity.isolationTitle')}</AlertTitle>
        <AlertDescription>{t('identity.bindingIsolation')}</AlertDescription>
      </Alert>
      {list.loading && !list.data ? <SettingsLoading /> : null}
      {list.error ? (
        <SettingsError error={list.error} retry={list.reload} />
      ) : null}
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='p-3'>{t('identity.issuer')}</th>
              <th className='p-3'>{t('identity.subject')}</th>
              <th className='p-3'>{t('settings.username')}</th>
              <th className='p-3'>{t('identity.localUserId')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).length === 0 ? (
              <tr>
                <td className='p-3 text-muted-foreground' colSpan={4}>
                  {t('identity.noBindings')}
                </td>
              </tr>
            ) : (
              list.data!.data.map((row) => (
                <tr key={row.id} className='border-t'>
                  <td className='p-3 break-all'>{row.issuer}</td>
                  <td className='p-3 font-mono'>{row.subject}</td>
                  <td className='p-3'>{row.username ?? '—'}</td>
                  <td className='p-3 font-mono'>{row.localUserId}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className='grid max-w-3xl gap-3'>
        <h2 className='text-base font-medium'>
          {t('identity.bindingPreview')}
        </h2>
        <Textarea
          rows={10}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t('identity.bindingPreview')}
        />
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={busy}
            variant='outline'
            onClick={() => void run('preview')}
          >
            {t('identity.preview')}
          </Button>
          <Button disabled={busy} onClick={() => void run('commit')}>
            {t('identity.commit')}
          </Button>
        </div>
        {preview ? (
          <pre className='overflow-auto rounded-md border bg-muted/40 p-3 text-xs'>
            {JSON.stringify(preview.summary, null, 2)}
            {'\n'}
            {preview.rows
              .map(
                (row) =>
                  `${row.index}: ${row.status}${row.conflicts.length ? ` ${row.conflicts.join(',')}` : ''}`,
              )
              .join('\n')}
          </pre>
        ) : null}
      </div>
    </PageContainer>
  );
}
