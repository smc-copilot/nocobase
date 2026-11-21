import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
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

export interface GatewaySettings {
  origin: string | null;
  applicationId: string | null;
  expectedApplicationId: string | null;
  clientId: string | null;
  resource: string | null;
  scopes: string[];
  publicBaseUrl: string | null;
  tencentCorpId: string | null;
  tencentSdkId: string | null;
  callbackRef: string | null;
  instanceId: string | null;
  hasSecret: boolean;
  credentialVersion: number;
  sources: Record<string, 'settings' | 'env' | 'none'>;
  runtime: {
    origin: string | null;
    applicationId: string | null;
    clientId: string | null;
    instanceId: string;
    configured: boolean;
  };
  deployment: {
    originAllowlist: string[];
    authorizationPathAllowlist: string[];
    testAdapter: boolean;
    adapterKind: 'http' | 'test';
    identityIssuance: 'unavailable' | 'test-adapter';
    queryHttpContract: 'unavailable';
    liveVerified: false;
    testAdapterRequiresRestart: true;
    originHotReload: true;
  };
  savedDoesNotVerify: true;
  saveDoesNotBind: true;
}

function sourceText(
  t: (key: string) => string,
  source: 'settings' | 'env' | 'none' | undefined,
): string {
  if (source === 'settings') return t('meetingGatewaySettings.sourceSettings');
  if (source === 'env') return t('meetingGatewaySettings.sourceEnv');
  return t('meetingGatewaySettings.sourceNone');
}

export function MeetingGatewaySettingsPanel(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useSettingsData<{ data: GatewaySettings }>(
    'meetingGateway/settings',
  );
  const row = request.data?.data;
  const [origin, setOrigin] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [expectedApplicationId, setExpectedApplicationId] = useState<
    string | null
  >(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [resource, setResource] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string | null>(null);
  const [tencentCorpId, setTencentCorpId] = useState<string | null>(null);
  const [tencentSdkId, setTencentSdkId] = useState<string | null>(null);
  const [callbackRef, setCallbackRef] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownOrigin = origin ?? row?.origin ?? '';
  const shownApplicationId = applicationId ?? row?.applicationId ?? '';
  const shownExpected =
    expectedApplicationId ?? row?.expectedApplicationId ?? '';
  const shownClientId = clientId ?? row?.clientId ?? '';
  const shownResource = resource ?? row?.resource ?? '';
  const shownScopes = scopes ?? (row?.scopes ?? []).join(' ');
  const shownPublicBase = publicBaseUrl ?? row?.publicBaseUrl ?? '';
  const shownCorp = tencentCorpId ?? row?.tencentCorpId ?? '';
  const shownSdk = tencentSdkId ?? row?.tencentSdkId ?? '';
  const shownCallback = callbackRef ?? row?.callbackRef ?? '';
  const shownInstance = instanceId ?? row?.instanceId ?? '';
  const originLooksHttp =
    shownOrigin.trim() !== '' &&
    !shownOrigin.trim().toLowerCase().startsWith('https://');

  if (request.loading && !row) return <SettingsLoading />;
  if (request.error) return <SettingsError error={request.error} />;

  const sendOrClear = (
    shown: string,
    saved: string | null | undefined,
    key: string,
  ) => (shown.trim() ? { [key]: shown.trim() } : saved ? { [key]: null } : {});

  return (
    <div className='flex flex-col gap-4'>
      <Alert>
        <AlertDescription>
          {t('meetingGatewaySettings.savedNotVerified')}{' '}
          {t('meetingGatewaySettings.localFormatOnly')}
        </AlertDescription>
      </Alert>
      <div className='flex flex-wrap gap-2'>
        <StatusBadge tone='neutral'>{t('meetingOa.liveVerified')}</StatusBadge>
        <StatusBadge tone={row?.hasSecret ? 'success' : 'warning'}>
          {t('meetingGatewaySettings.hasSecret', {
            value: row?.hasSecret
              ? t('meetingGatewaySettings.secretSealed')
              : t('meetingGatewaySettings.secretMissing'),
          })}
        </StatusBadge>
        <StatusBadge tone='info'>
          {t('meetingGatewaySettings.credentialVersion', {
            value: row?.credentialVersion ?? 0,
          })}
        </StatusBadge>
        <StatusBadge tone='neutral'>
          {row?.deployment.identityIssuance === 'test-adapter'
            ? 'identityIssuance: test-adapter'
            : 'identityIssuance: unavailable'}
        </StatusBadge>
        <StatusBadge tone='neutral'>
          queryHttpContract: {row?.deployment.queryHttpContract}
        </StatusBadge>
      </div>
      <Alert>
        <AlertDescription>
          {row?.deployment.testAdapter
            ? t('meetingGatewaySettings.testAdapter')
            : t('meetingGatewaySettings.httpAdapter')}
        </AlertDescription>
      </Alert>
      <Alert>
        <AlertDescription>
          {t('meetingGatewaySettings.identityUnavailable')}
        </AlertDescription>
      </Alert>
      <Alert>
        <AlertDescription>
          {t('meetingGatewaySettings.queryUnavailable')}
        </AlertDescription>
      </Alert>
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void api
            .request({
              path: 'meetingGateway/settings',
              method: 'PUT',
              json: {
                ...sendOrClear(shownOrigin, row?.origin, 'origin'),
                ...sendOrClear(
                  shownApplicationId,
                  row?.applicationId,
                  'applicationId',
                ),
                ...sendOrClear(
                  shownExpected,
                  row?.expectedApplicationId,
                  'expectedApplicationId',
                ),
                ...sendOrClear(shownClientId, row?.clientId, 'clientId'),
                ...sendOrClear(shownResource, row?.resource, 'resource'),
                ...(shownScopes.trim()
                  ? { scopes: shownScopes.trim() }
                  : row?.scopes?.length
                    ? { scopes: null }
                    : {}),
                ...sendOrClear(
                  shownPublicBase,
                  row?.publicBaseUrl,
                  'publicBaseUrl',
                ),
                ...sendOrClear(shownCorp, row?.tencentCorpId, 'tencentCorpId'),
                ...sendOrClear(shownSdk, row?.tencentSdkId, 'tencentSdkId'),
                ...sendOrClear(shownCallback, row?.callbackRef, 'callbackRef'),
                ...sendOrClear(shownInstance, row?.instanceId, 'instanceId'),
                ...(clearSecret
                  ? { clientSecret: null }
                  : clientSecret.trim()
                    ? { clientSecret: clientSecret.trim() }
                    : {}),
              },
            })
            .then(() => {
              setClientSecret('');
              setClearSecret(false);
              toaster.show({
                type: 'success',
                title: t('meetingGatewaySettings.settingsSaved'),
              });
              request.reload();
            })
            .catch((error: unknown) =>
              toaster.show({
                type: 'error',
                title:
                  error instanceof ApiClientError
                    ? error.message
                    : t('meetingGatewaySettings.settingsFailed'),
              }),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Card>
          <CardHeader>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingGatewaySettings.title')}
            </h2>
            <CardDescription>
              {t('meetingGatewaySettings.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <Field className='md:col-span-2'>
                  <FieldLabel htmlFor='gw-origin'>
                    {t('meetingGatewaySettings.fields.origin')}
                  </FieldLabel>
                  <Input
                    id='gw-origin'
                    value={shownOrigin}
                    autoComplete='off'
                    onChange={(event) => setOrigin(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.originHint')}
                  </FieldDescription>
                  {originLooksHttp ? (
                    <FieldDescription>
                      {t('meetingGatewaySettings.localFormatOnly')}
                    </FieldDescription>
                  ) : null}
                  <FieldDescription>
                    {sourceText(t, row?.sources.origin)}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-app'>
                    {t('meetingGatewaySettings.fields.applicationId')}
                  </FieldLabel>
                  <Input
                    id='gw-app'
                    value={shownApplicationId}
                    autoComplete='off'
                    onChange={(event) => setApplicationId(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.applicationHint')}
                  </FieldDescription>
                  <FieldDescription>
                    {sourceText(t, row?.sources.applicationId)}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-expected'>
                    {t('meetingGatewaySettings.fields.expectedApplicationId')}
                  </FieldLabel>
                  <Input
                    id='gw-expected'
                    value={shownExpected}
                    autoComplete='off'
                    onChange={(event) =>
                      setExpectedApplicationId(event.target.value)
                    }
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.expectedHint')}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-client'>
                    {t('meetingGatewaySettings.fields.clientId')}
                  </FieldLabel>
                  <Input
                    id='gw-client'
                    value={shownClientId}
                    autoComplete='off'
                    onChange={(event) => setClientId(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.clientIdHint')}
                  </FieldDescription>
                  <FieldDescription>
                    {sourceText(t, row?.sources.clientId)}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-resource'>
                    {t('meetingGatewaySettings.fields.resource')}
                  </FieldLabel>
                  <Input
                    id='gw-resource'
                    value={shownResource}
                    autoComplete='off'
                    onChange={(event) => setResource(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.resourceHint')}
                  </FieldDescription>
                </Field>
                <Field className='md:col-span-2'>
                  <FieldLabel htmlFor='gw-scopes'>
                    {t('meetingGatewaySettings.fields.scopes')}
                  </FieldLabel>
                  <Input
                    id='gw-scopes'
                    value={shownScopes}
                    autoComplete='off'
                    onChange={(event) => setScopes(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.scopesHint')}
                  </FieldDescription>
                </Field>
                <Field className='md:col-span-2'>
                  <FieldLabel htmlFor='gw-secret'>
                    {t('meetingGatewaySettings.fields.clientSecret')}
                  </FieldLabel>
                  <Input
                    id='gw-secret'
                    type='password'
                    value={clientSecret}
                    autoComplete='new-password'
                    disabled={clearSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                  />
                  <div className='flex items-start gap-3 pt-1'>
                    <Checkbox
                      id='gw-clear-secret'
                      checked={clearSecret}
                      onCheckedChange={(on: boolean) => {
                        setClearSecret(on);
                        if (on) setClientSecret('');
                      }}
                    />
                    <FieldLabel htmlFor='gw-clear-secret'>
                      {t('meetingGatewaySettings.clearSecret')}
                    </FieldLabel>
                  </div>
                  <FieldDescription>
                    {t('meetingGatewaySettings.clearSecretHint')}
                  </FieldDescription>
                </Field>
                <Field className='md:col-span-2'>
                  <FieldLabel htmlFor='gw-public'>
                    {t('meetingGatewaySettings.fields.publicBaseUrl')}
                  </FieldLabel>
                  <Input
                    id='gw-public'
                    value={shownPublicBase}
                    autoComplete='off'
                    onChange={(event) => setPublicBaseUrl(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.publicBaseHint')}
                  </FieldDescription>
                  <FieldDescription>
                    {sourceText(t, row?.sources.publicBaseUrl)}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-corp'>
                    {t('meetingGatewaySettings.fields.tencentCorpId')}
                  </FieldLabel>
                  <Input
                    id='gw-corp'
                    value={shownCorp}
                    autoComplete='off'
                    onChange={(event) => setTencentCorpId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-sdk'>
                    {t('meetingGatewaySettings.fields.tencentSdkId')}
                  </FieldLabel>
                  <Input
                    id='gw-sdk'
                    value={shownSdk}
                    autoComplete='off'
                    onChange={(event) => setTencentSdkId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-callback'>
                    {t('meetingGatewaySettings.fields.callbackRef')}
                  </FieldLabel>
                  <Input
                    id='gw-callback'
                    value={shownCallback}
                    autoComplete='off'
                    onChange={(event) => setCallbackRef(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='gw-instance'>
                    {t('meetingGatewaySettings.fields.instanceId')}
                  </FieldLabel>
                  <Input
                    id='gw-instance'
                    value={shownInstance}
                    autoComplete='off'
                    onChange={(event) => setInstanceId(event.target.value)}
                  />
                  <FieldDescription>
                    {t('meetingGatewaySettings.instanceHint')}
                  </FieldDescription>
                  <FieldDescription>
                    {sourceText(t, row?.sources.instanceId)}
                  </FieldDescription>
                </Field>
              </div>
              <FieldDescription>
                {t('meetingGatewaySettings.tencentHint')}
              </FieldDescription>
            </FieldGroup>
          </CardContent>
          <CardFooter className='flex flex-wrap items-center gap-3'>
            <Button type='submit' disabled={busy}>
              {t('meetingGatewaySettings.saveSettings')}
            </Button>
            <Link
              className='text-sm font-medium text-primary underline-offset-4 hover:underline'
              to='/settings/meeting-connections'
            >
              {t('meetingGatewaySettings.bindPage')}
            </Link>
          </CardFooter>
        </Card>
      </form>
      <Card>
        <CardHeader>
          <h2 className='font-heading text-base font-medium'>
            {t('meetingGatewaySettings.runtimeConfigured', {
              value: row?.runtime.configured
                ? t('meetingGatewaySettings.yes')
                : t('meetingGatewaySettings.no'),
            })}
          </h2>
          <CardDescription>
            {t('meetingGatewaySettings.runtimeOrigin', {
              value: row?.runtime.origin ?? '—',
            })}
          </CardDescription>
          <CardDescription>
            {t('meetingGatewaySettings.runtimeApplication', {
              value: row?.runtime.applicationId ?? '—',
            })}
          </CardDescription>
          <CardDescription>
            {t('meetingGatewaySettings.runtimeInstance', {
              value: row?.runtime.instanceId ?? 'default',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2 text-sm text-muted-foreground'>
          <p>{t('meetingGatewaySettings.originAllowlist')}</p>
          <p>
            {(row?.deployment.originAllowlist ?? []).join(', ') ||
              t('meetingGatewaySettings.allowlistEmpty')}
          </p>
          <p>{t('meetingGatewaySettings.authorizationPaths')}</p>
          <p>
            {(row?.deployment.authorizationPathAllowlist ?? []).join(', ') ||
              '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
