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
  tokenUrl: string | null;
  peopleUrl: string | null;
  meetingUrl: string | null;
  viewUrl: string | null;
  scope: string | null;
  clientId: string | null;
  tokenUrlConfigured: boolean;
  peopleUrlConfigured: boolean;
  meetingUrlConfigured: boolean;
  clientIdConfigured: boolean;
  hasSecret: boolean;
  writeContract: string;
  tokenContract: string;
  peopleContract: string;
  testAdapter: boolean;
  isolationNote: string | null;
  liveVerified: false;
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
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);
  const [peopleUrl, setPeopleUrl] = useState<string | null>(null);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [mapUserId, setMapUserId] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [busy, setBusy] = useState(false);
  const shownTokenUrl = tokenUrl ?? row?.tokenUrl ?? '';
  const shownPeopleUrl = peopleUrl ?? row?.peopleUrl ?? '';
  const shownMeetingUrl = meetingUrl ?? row?.meetingUrl ?? '';
  const shownViewUrl = viewUrl ?? row?.viewUrl ?? '';
  const shownScope = scope ?? row?.scope ?? '';
  const shownClientId = clientId ?? row?.clientId ?? '';

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
      <p className='text-sm text-muted-foreground'>
        {t('meetingOa.liveVerified')}
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
                ...(shownTokenUrl.trim()
                  ? { tokenUrl: shownTokenUrl.trim() }
                  : row?.tokenUrl
                    ? { tokenUrl: null }
                    : {}),
                ...(shownPeopleUrl.trim()
                  ? { peopleUrl: shownPeopleUrl.trim() }
                  : row?.peopleUrl
                    ? { peopleUrl: null }
                    : {}),
                ...(shownMeetingUrl.trim()
                  ? { meetingUrl: shownMeetingUrl.trim() }
                  : row?.meetingUrl
                    ? { meetingUrl: null }
                    : {}),
                ...(shownViewUrl.trim()
                  ? { viewUrl: shownViewUrl.trim() }
                  : row?.viewUrl
                    ? { viewUrl: null }
                    : {}),
                ...(shownScope.trim()
                  ? { scope: shownScope.trim() }
                  : row?.scope
                    ? { scope: null }
                    : {}),
                ...(shownClientId.trim()
                  ? { clientId: shownClientId.trim() }
                  : row?.clientId
                    ? { clientId: null }
                    : {}),
                ...(clientSecret.trim()
                  ? { clientSecret: clientSecret.trim() }
                  : {}),
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
          value={shownTokenUrl}
          onChange={(event) => setTokenUrl(event.target.value)}
        />
        <Label htmlFor='oa-people-url'>{t('meetingOa.fields.peopleUrl')}</Label>
        <Input
          id='oa-people-url'
          value={shownPeopleUrl}
          onChange={(event) => setPeopleUrl(event.target.value)}
        />
        <Label htmlFor='oa-meeting-url'>
          {t('meetingOa.fields.meetingUrl')}
        </Label>
        <Input
          id='oa-meeting-url'
          value={shownMeetingUrl}
          onChange={(event) => setMeetingUrl(event.target.value)}
        />
        <Label htmlFor='oa-view-url'>{t('meetingOa.fields.viewUrl')}</Label>
        <Input
          id='oa-view-url'
          value={shownViewUrl}
          onChange={(event) => setViewUrl(event.target.value)}
        />
        <Label htmlFor='oa-scope'>{t('meetingOa.fields.scope')}</Label>
        <Input
          id='oa-scope'
          value={shownScope}
          onChange={(event) => setScope(event.target.value)}
        />
        <Label htmlFor='oa-client'>{t('meetingOa.fields.clientId')}</Label>
        <Input
          id='oa-client'
          value={shownClientId}
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
