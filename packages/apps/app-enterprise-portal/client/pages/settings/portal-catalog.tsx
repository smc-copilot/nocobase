import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';

interface CatalogApplication {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly baseUrl: string;
  readonly targetPath: string;
  readonly healthUrl: string | null;
  readonly enabled: boolean;
}

const APP_TYPES = ['octop', 'weknora', 'nocobase', 'https'] as const;

export default function PortalCatalogPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const list = useSettingsData<{
    data: readonly CatalogApplication[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/applications');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    appCode: '',
    name: '',
    appType: 'https',
    baseUrl: 'https://example.com/apps/',
    targetPath: '/',
  });

  const create = async () => {
    setBusy(true);
    try {
      await api.request({
        path: 'enterpriseAppPortal/admin/applications',
        method: 'POST',
        json: form,
      });
      toaster.show({ type: 'success', title: t('portal.catalogSaved') });
      list.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof Error ? error.message : t('portal.catalogFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalCatalog')}
        description={t('settings.portalCatalogDescription')}
      />
      <Alert>
        <AlertTitle>{t('portal.isolationTitle')}</AlertTitle>
        <AlertDescription>{t('portal.catalogNotAccess')}</AlertDescription>
      </Alert>
      {list.loading && !list.data ? <SettingsLoading /> : null}
      {list.error ? (
        <SettingsError error={list.error} retry={list.reload} />
      ) : null}
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='p-3'>{t('portal.appCode')}</th>
              <th className='p-3'>{t('portal.appName')}</th>
              <th className='p-3'>{t('portal.appType')}</th>
              <th className='p-3'>{t('portal.baseUrl')}</th>
              <th className='p-3'>{t('settings.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).map((row) => (
              <tr key={row.appCode} className='border-t'>
                <td className='p-3 font-mono'>{row.appCode}</td>
                <td className='p-3'>{row.name}</td>
                <td className='p-3'>{row.appType}</td>
                <td className='p-3 break-all'>{row.baseUrl}</td>
                <td className='p-3'>
                  {row.enabled ? t('settings.enabled') : t('settings.disabled')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className='grid max-w-xl gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h2 className='text-base font-medium'>{t('portal.catalogCreate')}</h2>
        <Label htmlFor='appCode'>{t('portal.appCode')}</Label>
        <Input
          id='appCode'
          value={form.appCode}
          onChange={(event) =>
            setForm((current) => ({ ...current, appCode: event.target.value }))
          }
        />
        <Label htmlFor='name'>{t('portal.appName')}</Label>
        <Input
          id='name'
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
        <Label>{t('portal.appType')}</Label>
        <Select
          items={APP_TYPES.map((value) => ({ value, label: value }))}
          value={form.appType}
          onValueChange={(value) =>
            setForm((current) => ({ ...current, appType: String(value) }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor='baseUrl'>{t('portal.baseUrl')}</Label>
        <Input
          id='baseUrl'
          value={form.baseUrl}
          onChange={(event) =>
            setForm((current) => ({ ...current, baseUrl: event.target.value }))
          }
        />
        <Button type='submit' disabled={busy}>
          {t('settings.create')}
        </Button>
      </form>
    </PageContainer>
  );
}
