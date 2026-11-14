import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SettingsModulePage } from '../settings-module-page.js';
import {
  AGENT_SCOPES,
  useAgentList,
  type AgentClientCreated,
  type AgentClientRow,
} from './client.js';

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError && error.reason
    ? `${fallback} (${error.reason})`
    : fallback;
}

export default function AgentClientsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useAgentList<AgentClientRow>(
    '/agentAuthorization/clients',
    reloadKey,
  );
  const [name, setName] = useState('');
  const [instanceLabel, setInstanceLabel] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [scopes, setScopes] = useState<string[]>(['business-ui:view']);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const failed = t('agentAuthorization.requestFailed');

  async function createClient(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const body = await api.request<{ data: AgentClientCreated }>({
        path: '/agentAuthorization/clients',
        method: 'POST',
        json: {
          name,
          instanceLabel: instanceLabel.trim() ? instanceLabel.trim() : null,
          redirectUris: [redirectUri],
          allowedScopes: scopes,
          enabled: true,
        },
      });
      setSecret(body.data.clientSecret);
      setName('');
      setInstanceLabel('');
      setRedirectUri('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setFormError(failureMessage(caught, failed));
    } finally {
      setBusy(false);
    }
  }

  async function patch(
    clientId: string,
    json: { readonly enabled: boolean } | undefined,
    pathSuffix = '',
  ) {
    setBusy(true);
    setFormError(null);
    try {
      const body = await api.request<{ data: AgentClientCreated }>({
        path: `/agentAuthorization/clients/${encodeURIComponent(clientId)}${pathSuffix}`,
        method: pathSuffix ? 'POST' : 'PATCH',
        json,
      });
      if (body.data.clientSecret) setSecret(body.data.clientSecret);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setFormError(failureMessage(caught, failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsModulePage
      title={t('agentAuthorization.clients')}
      description={t('agentAuthorization.clientsDescription')}
    >
      <form
        className='grid max-w-xl gap-3'
        onSubmit={(event) => void createClient(event)}
      >
        <div className='grid gap-1'>
          <Label htmlFor='agent-client-name'>
            {t('agentAuthorization.name')}
          </Label>
          <Input
            id='agent-client-name'
            value={name}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='grid gap-1'>
          <Label htmlFor='agent-client-instance'>
            {t('agentAuthorization.instanceLabel')}
          </Label>
          <Input
            id='agent-client-instance'
            value={instanceLabel}
            onChange={(event) => setInstanceLabel(event.target.value)}
          />
        </div>
        <div className='grid gap-1'>
          <Label htmlFor='agent-client-redirect'>
            {t('agentAuthorization.redirectUri')}
          </Label>
          <Input
            id='agent-client-redirect'
            type='url'
            required
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
          />
        </div>
        <fieldset className='grid gap-2'>
          <legend className='text-sm font-medium'>
            {t('agentAuthorization.scopes')}
          </legend>
          {AGENT_SCOPES.map((scope) => (
            <label key={scope} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={scopes.includes(scope)}
                onChange={(event) => {
                  setScopes((current) =>
                    event.target.checked
                      ? [...current, scope]
                      : current.filter((item) => item !== scope),
                  );
                }}
              />
              {t(`agentAuthorization.scope.${scope}`)}
            </label>
          ))}
        </fieldset>
        <Button type='submit' disabled={busy || scopes.length === 0}>
          {t('agentAuthorization.create')}
        </Button>
      </form>
      {secret ? (
        <p className='rounded-lg border bg-muted p-3 text-sm break-all'>
          {t('agentAuthorization.secretOnce')}
          <br />
          <code>{secret}</code>
        </p>
      ) : null}
      {formError || error ? (
        <p className='text-sm text-destructive'>{formError ?? error}</p>
      ) : null}
      {data && data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('agentAuthorization.empty')}
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('agentAuthorization.name')}</TableHead>
              <TableHead>{t('agentAuthorization.instanceLabel')}</TableHead>
              <TableHead>{t('agentAuthorization.scopes')}</TableHead>
              <TableHead>{t('agentAuthorization.status')}</TableHead>
              <TableHead>{t('agentAuthorization.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((client) => (
              <TableRow key={client.clientId}>
                <TableCell>
                  <div className='font-medium'>{client.name}</div>
                  <div className='text-muted-foreground'>{client.clientId}</div>
                </TableCell>
                <TableCell>{client.instanceLabel ?? '—'}</TableCell>
                <TableCell>{client.allowedScopes.join(', ')}</TableCell>
                <TableCell>
                  {client.enabled
                    ? t('agentAuthorization.enabled')
                    : t('agentAuthorization.disabled')}
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={busy}
                      onClick={() =>
                        void patch(client.clientId, undefined, '/rotateSecret')
                      }
                    >
                      {t('agentAuthorization.rotate')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={busy}
                      onClick={() =>
                        void patch(client.clientId, {
                          enabled: !client.enabled,
                        })
                      }
                    >
                      {client.enabled
                        ? t('agentAuthorization.disable')
                        : t('agentAuthorization.enable')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SettingsModulePage>
  );
}
