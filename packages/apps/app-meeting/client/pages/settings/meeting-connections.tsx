import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { useSettingsData } from './hooks.js';
import { ConfirmAction, SettingsError, SettingsLoading } from './shared.js';

interface GatewayConfig {
  configured: boolean;
  originConfigured: boolean;
  applicationConfigured: boolean;
  identityIssuance: 'unavailable' | 'test-adapter' | 'stored';
  testAdapter: boolean;
  queryHttpContract: 'unavailable';
  disconnectRevokesUpstream: false;
}

interface GatewayBinding {
  id: string;
  status: string;
  connectionRef: string | null;
  connectionName: string | null;
  connectionType: string | null;
  availableConnections: readonly {
    connectionId: string;
    name: string;
    type: string;
    status: string;
  }[];
  disconnectRevokesUpstream: false;
}

const STATE_KEY = 'meeting-gateway-oauth-state';

export default function MeetingConnectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const configRequest = useSettingsData<{ data: GatewayConfig }>(
    'meetingGateway/config',
  );
  const bindingRequest = useSettingsData<{ data: GatewayBinding }>(
    'meetingGateway/bindings',
  );
  const config = configRequest.data?.data;
  const binding = bindingRequest.data?.data;
  const error = configRequest.error ?? bindingRequest.error;
  const loading = configRequest.loading || bindingRequest.loading;
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>();

  const refresh = () => {
    configRequest.reload();
    bindingRequest.reload();
  };

  const start = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      const result = await api.request<{
        data: { authorizationUrl: string; state: string };
      }>({
        path: 'meetingGateway/bindings/start',
        method: 'POST',
        json: {},
      });
      sessionStorage.setItem(STATE_KEY, result.data.state);
      window.location.assign(result.data.authorizationUrl);
    } catch (next) {
      setActionError(next);
      setBusy(false);
    }
  };

  const select = async (connectionId: string) => {
    if (!binding || binding.id === 'none') return;
    setBusy(true);
    setActionError(undefined);
    try {
      const result = await api.request<{ data: GatewayBinding }>({
        path: `meetingGateway/bindings/${binding.id}/select`,
        method: 'POST',
        json: { connectionId },
      });
      bindingRequest.replaceData({ data: result.data });
      toaster.show({
        type: 'success',
        title: t('meetingConnections.selected'),
      });
    } catch (next) {
      setActionError(next);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!binding || binding.id === 'none') return;
    setBusy(true);
    setActionError(undefined);
    try {
      const result = await api.request<{ data: GatewayBinding }>({
        path: `meetingGateway/bindings/${binding.id}/disconnect`,
        method: 'POST',
        json: {},
      });
      bindingRequest.replaceData({ data: result.data });
      setDisconnectOpen(false);
      toaster.show({
        type: 'success',
        title: t('meetingConnections.disconnected'),
      });
    } catch (next) {
      setActionError(next);
    } finally {
      setBusy(false);
    }
  };

  const reason =
    actionError instanceof ApiClientError ? actionError.reason : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('meetingConnections.title')}
        description={t('meetingConnections.description')}
      />
      {loading && !config && !binding ? (
        <SettingsLoading />
      ) : (
        <div className='flex max-w-3xl flex-col gap-4'>
          <SettingsError
            error={actionError ?? error}
            retry={() => {
              setActionError(undefined);
              refresh();
            }}
          />
          {reason === 'GATEWAY_IDENTITY_TOKEN_UNAVAILABLE' ||
          binding?.status === 'identity_unavailable' ||
          config?.identityIssuance === 'unavailable' ? (
            <Alert>
              <AlertDescription>
                {t('meetingConnections.identityUnavailable')}
              </AlertDescription>
            </Alert>
          ) : null}
          {!config?.configured && !config?.testAdapter ? (
            <Alert>
              <AlertDescription>
                {t('meetingConnections.notConfigured')}
              </AlertDescription>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('meetingConnections.binding')}</CardTitle>
              <CardDescription>
                {t(`meetingConnections.status.${binding?.status ?? 'pending'}`)}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              {binding?.connectionName ? (
                <p className='text-sm'>
                  {t('meetingConnections.currentConnection', {
                    name: binding.connectionName,
                  })}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('meetingConnections.noConnection')}
                </p>
              )}
              <p className='text-sm text-muted-foreground'>
                {t('meetingConnections.disconnectScope')}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('meetingConnections.rootUnrestricted')}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('meetingConnections.serverConfigHint')}{' '}
                <Link
                  className='underline'
                  to='/settings/meeting-integrations?tab=gateway'
                >
                  {t('meetingConnections.serverConfigLink')}
                </Link>
              </p>
              <div className='flex flex-wrap gap-2'>
                <Button
                  disabled={
                    busy || (!config?.configured && !config?.testAdapter)
                  }
                  onClick={() => void start()}
                >
                  {t('meetingConnections.bind')}
                </Button>
                {binding &&
                binding.id !== 'none' &&
                binding.status !== 'disconnected' &&
                binding.status !== 'not_configured' ? (
                  <Button
                    variant='destructive'
                    disabled={busy}
                    onClick={() => setDisconnectOpen(true)}
                  >
                    {t('meetingConnections.disconnect')}
                  </Button>
                ) : null}
              </div>
              {binding?.availableConnections.length ? (
                <ul className='flex flex-col gap-2'>
                  {binding.availableConnections.map((item) => (
                    <li
                      key={item.connectionId}
                      className='flex items-center justify-between gap-2 rounded-lg border p-3'
                    >
                      <div>
                        <p className='font-medium'>{item.name}</p>
                        <p className='text-sm text-muted-foreground'>
                          {item.type} · {item.status}
                        </p>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={busy}
                        onClick={() => void select(item.connectionId)}
                      >
                        {t('meetingConnections.select')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
      <ConfirmAction
        open={disconnectOpen}
        title={t('meetingConnections.disconnect')}
        description={t('meetingConnections.disconnectScope')}
        confirmLabel={t('meetingConnections.disconnect')}
        busy={busy}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={() => void disconnect()}
      />
    </PageContainer>
  );
}

export function MeetingGatewayCallbackPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const state = sessionStorage.getItem(STATE_KEY) || params.get('localState');
    if (!state) {
      void navigate('/settings/meeting-connections', { replace: true });
      return;
    }
    void api
      .request({
        path: 'meetingGateway/bindings/complete',
        method: 'POST',
        json: { state },
      })
      .then(() => {
        sessionStorage.removeItem(STATE_KEY);
        void navigate('/settings/meeting-connections', { replace: true });
      })
      .catch((next: unknown) => {
        setError(next);
      });
  }, [api, navigate, params]);

  return (
    <PageContainer>
      <PageHeader title={t('meetingConnections.completing')} />
      <SettingsError error={error} />
    </PageContainer>
  );
}
