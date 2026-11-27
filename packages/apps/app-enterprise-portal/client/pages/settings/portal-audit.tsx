import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';

interface AuditEvent {
  readonly id: string;
  readonly actorUserId?: string | null;
  readonly appCode?: string | null;
  readonly action: string;
  readonly result: string;
  readonly reason?: string | null;
  readonly createdAt: string;
}

export default function PortalAuditPage(): ReactElement {
  const { t } = useTranslation();
  const list = useSettingsData<{
    data: readonly AuditEvent[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/auditEvents');

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalAudit')}
        description={t('settings.portalAuditDescription')}
      />
      <Alert>
        <AlertTitle>{t('portal.auditTitle')}</AlertTitle>
        <AlertDescription>{t('portal.auditHint')}</AlertDescription>
      </Alert>
      {list.loading && !list.data ? <SettingsLoading /> : null}
      {list.error ? (
        <SettingsError error={list.error} retry={list.reload} />
      ) : null}
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='p-3'>{t('portal.when')}</th>
              <th className='p-3'>{t('portal.actor')}</th>
              <th className='p-3'>{t('portal.appCode')}</th>
              <th className='p-3'>{t('portal.action')}</th>
              <th className='p-3'>{t('portal.result')}</th>
              <th className='p-3'>{t('portal.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).length === 0 ? (
              <tr>
                <td className='p-3 text-muted-foreground' colSpan={6}>
                  {t('portal.noAudit')}
                </td>
              </tr>
            ) : (
              list.data!.data.map((row) => (
                <tr key={row.id} className='border-t'>
                  <td className='p-3 whitespace-nowrap'>{row.createdAt}</td>
                  <td className='p-3 font-mono'>{row.actorUserId ?? '—'}</td>
                  <td className='p-3'>{row.appCode ?? '—'}</td>
                  <td className='p-3'>{row.action}</td>
                  <td className='p-3'>{row.result}</td>
                  <td className='p-3'>{row.reason ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
