import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { useSettingsData } from './hooks.js';
import { SettingsError, SettingsLoading } from './shared.js';

interface Settings {
  tokenUrlConfigured: boolean;
  peopleUrlConfigured: boolean;
  clientIdConfigured: boolean;
  hasSecret: boolean;
  writeContract: string;
  tokenContract: string;
  peopleContract: string;
  testAdapter: boolean;
  isolationNote: string | null;
}

export default function MeetingIntegrationsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useSettingsData<{ data: Settings }>('meetingOa/settings');
  const maps = useSettingsData<{
    data: { userId: string; employeeNo: string | null }[];
  }>('meetingOa/identities');
  const row = request.data?.data;
  const [tokenUrl, setTokenUrl] = useState('');
  const [peopleUrl, setPeopleUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mapUserId, setMapUserId] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [busy, setBusy] = useState(false);

  if (request.loading && !row) return <SettingsLoading />;
  if (request.error) return <SettingsError error={request.error} />;

  return (
    <PageContainer>
      <PageHeader
        title={t('meetingOa.integrationsTitle')}
        description={t('meetingOa.integrationsDescription')}
      />
      <Alert>
        <AlertDescription>
          {row?.isolationNote ?? t('meetingOa.liveWriteBlocked')}
        </AlertDescription>
      </Alert>
      <p className='text-sm text-muted-foreground'>
        {t('meetingOa.writeContract', {
          value: row?.writeContract ?? 'unavailable',
        })}
      </p>
      <p className='text-sm text-muted-foreground'>
        {t('meetingOa.hasSecret', {
          value: row?.hasSecret
            ? t('meetingOa.secretSealed')
            : t('meetingOa.secretMissing'),
        })}
      </p>
      <form
        className='mt-4 flex max-w-xl flex-col gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void api
            .request({
              path: 'meetingOa/settings',
              method: 'PUT',
              json: {
                tokenUrl: tokenUrl || null,
                peopleUrl: peopleUrl || null,
                clientId: clientId || null,
                clientSecret: clientSecret || null,
              },
            })
            .then(() => {
              setClientSecret('');
              toaster.show({
                type: 'success',
                title: t('meetingOa.settingsSaved'),
              });
              request.reload();
            })
            .catch((error: unknown) =>
              toaster.show({
                type: 'error',
                title:
                  error instanceof ApiClientError
                    ? error.message
                    : t('meetingOa.settingsFailed'),
              }),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Label htmlFor='oa-token'>{t('meetingOa.fields.tokenUrl')}</Label>
        <Input
          id='oa-token'
          value={tokenUrl}
          onChange={(event) => setTokenUrl(event.target.value)}
        />
        <Label htmlFor='oa-people-url'>{t('meetingOa.fields.peopleUrl')}</Label>
        <Input
          id='oa-people-url'
          value={peopleUrl}
          onChange={(event) => setPeopleUrl(event.target.value)}
        />
        <Label htmlFor='oa-client'>{t('meetingOa.fields.clientId')}</Label>
        <Input
          id='oa-client'
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        />
        <Label htmlFor='oa-secret'>{t('meetingOa.fields.clientSecret')}</Label>
        <Input
          id='oa-secret'
          type='password'
          value={clientSecret}
          autoComplete='new-password'
          onChange={(event) => setClientSecret(event.target.value)}
        />
        <Button type='submit' disabled={busy}>
          {t('meetingOa.saveSettings')}
        </Button>
      </form>
      <form
        className='mt-8 flex max-w-xl flex-col gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void api
            .request({
              path: 'meetingOa/identities',
              method: 'PUT',
              json: { userId: mapUserId, employeeNo },
            })
            .then(() => {
              toaster.show({ type: 'success', title: t('meetingOa.mapSaved') });
              maps.reload();
            })
            .catch((error: unknown) =>
              toaster.show({
                type: 'error',
                title:
                  error instanceof ApiClientError
                    ? error.message
                    : t('meetingOa.mapFailed'),
              }),
            )
            .finally(() => setBusy(false));
        }}
      >
        <h2 className='text-base font-medium'>{t('meetingOa.mappingTitle')}</h2>
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.mappingHint')}
        </p>
        <Label htmlFor='oa-map-user'>{t('meetingOa.fields.userId')}</Label>
        <Input
          id='oa-map-user'
          value={mapUserId}
          onChange={(event) => setMapUserId(event.target.value)}
        />
        <Label htmlFor='oa-map-emp'>{t('meetingOa.fields.employeeNo')}</Label>
        <Input
          id='oa-map-emp'
          value={employeeNo}
          onChange={(event) => setEmployeeNo(event.target.value)}
        />
        <Button type='submit' disabled={busy}>
          {t('meetingOa.saveMap')}
        </Button>
      </form>
      <ul className='mt-4 text-sm'>
        {(maps.data?.data ?? []).map((item) => (
          <li key={item.userId}>
            {item.userId} → {item.employeeNo}
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
