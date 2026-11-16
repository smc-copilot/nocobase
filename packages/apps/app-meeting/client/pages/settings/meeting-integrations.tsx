import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '#components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { StatusBadge } from '#components/status-badge';
import { useSettingsData } from './hooks.js';
import { SettingsError, SettingsLoading } from './shared.js';
import { MeetingEmptyState } from '../meetings/meeting-feedback.js';

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
  peopleUrlSource: 'settings' | 'env' | 'test' | 'none';
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
      <div className='flex flex-wrap gap-2'>
        <StatusBadge tone='neutral'>{t('meetingOa.liveVerified')}</StatusBadge>
        <StatusBadge tone={row?.hasSecret ? 'success' : 'warning'}>
          {t('meetingOa.hasSecret', {
            value: row?.hasSecret
              ? t('meetingOa.secretSealed')
              : t('meetingOa.secretMissing'),
          })}
        </StatusBadge>
        <StatusBadge tone='info'>
          {t('meetingOa.writeContract', {
            value: row?.writeContract ?? 'unavailable',
          })}
        </StatusBadge>
      </div>
      <form
        className='flex flex-col gap-4'
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
        <Card>
          <CardHeader>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingOa.integrationsTitle')}
            </h2>
            <CardDescription>
              {t('meetingOa.integrationsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='oa-token'>
                    {t('meetingOa.fields.tokenUrl')}
                  </FieldLabel>
                  <Input
                    id='oa-token'
                    value={shownTokenUrl}
                    onChange={(event) => setTokenUrl(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-people-url'>
                    {t('meetingOa.fields.peopleUrl')}
                  </FieldLabel>
                  <Input
                    id='oa-people-url'
                    value={shownPeopleUrl}
                    onChange={(event) => setPeopleUrl(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingOa.peopleUrlHint')}
                  </FieldDescription>
                  <FieldDescription>
                    {row?.peopleUrlSource === 'settings'
                      ? t('meetingOa.peopleUrlSourceSettings')
                      : row?.peopleUrlSource === 'env'
                        ? t('meetingOa.peopleUrlSourceEnv')
                        : row?.peopleUrlSource === 'test'
                          ? t('meetingOa.peopleUrlSourceTest')
                          : t('meetingOa.peopleUrlSourceNone')}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-meeting-url'>
                    {t('meetingOa.fields.meetingUrl')}
                  </FieldLabel>
                  <Input
                    id='oa-meeting-url'
                    value={shownMeetingUrl}
                    onChange={(event) => setMeetingUrl(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-view-url'>
                    {t('meetingOa.fields.viewUrl')}
                  </FieldLabel>
                  <Input
                    id='oa-view-url'
                    value={shownViewUrl}
                    onChange={(event) => setViewUrl(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-scope'>
                    {t('meetingOa.fields.scope')}
                  </FieldLabel>
                  <Input
                    id='oa-scope'
                    value={shownScope}
                    onChange={(event) => setScope(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-client'>
                    {t('meetingOa.fields.clientId')}
                  </FieldLabel>
                  <Input
                    id='oa-client'
                    value={shownClientId}
                    onChange={(event) => setClientId(event.target.value)}
                  />
                </Field>
                <Field className='md:col-span-2'>
                  <FieldLabel htmlFor='oa-secret'>
                    {t('meetingOa.fields.clientSecret')}
                  </FieldLabel>
                  <Input
                    id='oa-secret'
                    type='password'
                    value={clientSecret}
                    autoComplete='new-password'
                    onChange={(event) => setClientSecret(event.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type='submit' disabled={busy}>
              {t('meetingOa.saveSettings')}
            </Button>
          </CardFooter>
        </Card>
      </form>
      <form
        className='flex flex-col gap-4'
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
        <Card>
          <CardHeader>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingOa.mappingTitle')}
            </h2>
            <CardDescription>{t('meetingOa.mappingHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='oa-map-user'>
                    {t('meetingOa.fields.userId')}
                  </FieldLabel>
                  <Input
                    id='oa-map-user'
                    value={mapUserId}
                    onChange={(event) => setMapUserId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='oa-map-emp'>
                    {t('meetingOa.fields.employeeNo')}
                  </FieldLabel>
                  <Input
                    id='oa-map-emp'
                    value={employeeNo}
                    onChange={(event) => setEmployeeNo(event.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type='submit' disabled={busy}>
              {t('meetingOa.saveMap')}
            </Button>
          </CardFooter>
        </Card>
      </form>
      {(maps.data?.data ?? []).length ? (
        <Card>
          <CardHeader>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingOa.mappingTitle')}
            </h2>
          </CardHeader>
          <CardContent>
            <ul className='flex flex-col gap-2 text-sm'>
              {(maps.data?.data ?? []).map((item) => (
                <li
                  key={item.userId}
                  className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-input px-3 py-2'
                >
                  <span className='break-all'>{item.userId}</span>
                  <StatusBadge tone='success' size='sm'>
                    {item.employeeNo}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <MeetingEmptyState title={t('meetingOa.mappingEmpty')} />
      )}
    </PageContainer>
  );
}
