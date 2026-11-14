import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SettingsModulePage } from '../settings-module-page.js';
import { useAgentList, type AgentAuditEvent } from './client.js';

function when(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export default function AgentAuditPage(): ReactElement {
  const { t } = useTranslation();
  const [reloadKey] = useState(0);
  const { data, error } = useAgentList<AgentAuditEvent>(
    '/agentAuthorization/auditEvents',
    reloadKey,
  );

  return (
    <SettingsModulePage
      title={t('agentAuthorization.audit')}
      description={t('agentAuthorization.auditDescription')}
    >
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      {data && data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('agentAuthorization.empty')}
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('agentAuthorization.when')}</TableHead>
              <TableHead>{t('agentAuthorization.action')}</TableHead>
              <TableHead>{t('agentAuthorization.decision')}</TableHead>
              <TableHead>{t('agentAuthorization.client')}</TableHead>
              <TableHead>{t('agentAuthorization.user')}</TableHead>
              <TableHead>{t('agentAuthorization.grant')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{when(event.createdAt)}</TableCell>
                <TableCell>{event.action}</TableCell>
                <TableCell>{event.decision}</TableCell>
                <TableCell>{event.clientId ?? '—'}</TableCell>
                <TableCell>{event.localUserId ?? '—'}</TableCell>
                <TableCell>{event.grantId ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SettingsModulePage>
  );
}
