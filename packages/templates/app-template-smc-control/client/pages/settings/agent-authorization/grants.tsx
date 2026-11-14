import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SettingsModulePage } from '../settings-module-page.js';
import { useAgentList, type AgentGrantRow } from './client.js';

export default function AgentGrantsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useAgentList<AgentGrantRow>(
    '/agentAuthorization/grants',
    reloadKey,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function revoke(grantId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api.request({
        path: `/agentAuthorization/grants/${encodeURIComponent(grantId)}/revoke`,
        method: 'POST',
      });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      const fallback = t('agentAuthorization.requestFailed');
      setActionError(
        caught instanceof ApiClientError && caught.reason
          ? `${fallback} (${caught.reason})`
          : fallback,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsModulePage
      title={t('agentAuthorization.grants')}
      description={t('agentAuthorization.grantsDescription')}
    >
      {actionError || error ? (
        <p className='text-sm text-destructive'>{actionError ?? error}</p>
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
              <TableHead>{t('agentAuthorization.client')}</TableHead>
              <TableHead>{t('agentAuthorization.user')}</TableHead>
              <TableHead>{t('agentAuthorization.audience')}</TableHead>
              <TableHead>{t('agentAuthorization.scopes')}</TableHead>
              <TableHead>{t('agentAuthorization.status')}</TableHead>
              <TableHead>{t('agentAuthorization.expires')}</TableHead>
              <TableHead>{t('agentAuthorization.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((grant) => (
              <TableRow key={grant.grantId}>
                <TableCell>{grant.clientId}</TableCell>
                <TableCell>{grant.localUserId}</TableCell>
                <TableCell>{grant.audience}</TableCell>
                <TableCell>{grant.scopes.join(', ')}</TableCell>
                <TableCell>{grant.status}</TableCell>
                <TableCell>
                  {grant.expiresAt ?? t('agentAuthorization.noExpiry')}
                </TableCell>
                <TableCell>
                  {grant.status === 'active' ? (
                    <Button
                      type='button'
                      variant='outline'
                      disabled={busy}
                      onClick={() => void revoke(grant.grantId)}
                    >
                      {t('agentAuthorization.revoke')}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SettingsModulePage>
  );
}
