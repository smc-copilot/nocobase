import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';

interface CasdoorApplication {
  readonly name: string;
  readonly displayName: string;
  readonly organization: string;
  readonly owner: string;
  readonly homepageUrl: string;
}

interface CatalogApplication {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly baseUrl: string;
  readonly targetPath: string;
  readonly healthUrl: string | null;
  readonly casdoorAppKey: string | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
}

interface MergedRow {
  readonly casdoor: CasdoorApplication;
  readonly local?: CatalogApplication;
}

interface FieldDraft {
  readonly name?: string;
  readonly baseUrl?: string;
  readonly sortOrder?: string;
}

const APP_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function inferAppType(name: string): 'octop' | 'https' {
  return name.toLowerCase().includes('octop') ? 'octop' : 'https';
}

/** Catalog appCode must be ASCII URL-safe; keep casdoorAppKey as the Casdoor name. */
function toAppCode(casdoorName: string): string {
  if (APP_CODE_PATTERN.test(casdoorName) && casdoorName !== 'admin') {
    return casdoorName;
  }
  const bytes = new TextEncoder().encode(casdoorName);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
    .slice(0, 48);
  return `casdoor-${encoded || 'app'}`;
}

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function matchLocal(
  localApps: readonly CatalogApplication[],
  casdoorName: string,
): CatalogApplication | undefined {
  return localApps.find(
    (row) => row.casdoorAppKey === casdoorName || row.appCode === casdoorName,
  );
}

export default function PortalCatalogPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canWrite = useCan({
    resource: { type: 'settings', id: 'enterpriseAppPortal.catalog' },
    action: 'configure',
  }).can;

  const casdoorList = useSettingsData<{
    data: readonly CasdoorApplication[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/casdoor/applications?page=1&pageSize=100');
  const localList = useSettingsData<{
    data: readonly CatalogApplication[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/applications');

  const [busyKey, setBusyKey] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>({});

  const casdoorApps = useMemo(
    () => casdoorList.data?.data ?? [],
    [casdoorList.data?.data],
  );
  const localApps = useMemo(
    () => localList.data?.data ?? [],
    [localList.data?.data],
  );
  const loading =
    (casdoorList.loading || localList.loading) && casdoorApps.length === 0;
  const error = casdoorList.error ?? localList.error;

  const rows = useMemo((): readonly MergedRow[] => {
    return casdoorApps.map((casdoor) => ({
      casdoor,
      local: matchLocal(localApps, casdoor.name),
    }));
  }, [casdoorApps, localApps]);

  const fieldValue = (row: MergedRow, field: keyof FieldDraft): string => {
    const draft = drafts[row.casdoor.name];
    if (field === 'name') {
      return (
        draft?.name ??
        row.local?.name ??
        row.casdoor.displayName ??
        row.casdoor.name
      );
    }
    if (field === 'baseUrl') {
      return (
        draft?.baseUrl ?? row.local?.baseUrl ?? row.casdoor.homepageUrl ?? ''
      );
    }
    return draft?.sortOrder ?? String(row.local?.sortOrder ?? 0);
  };

  const setField = (key: string, field: keyof FieldDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  };

  const reload = () => {
    setDrafts({});
    casdoorList.reload();
    localList.reload();
  };

  const importApp = async (row: MergedRow) => {
    if (!canWrite) return;
    const baseUrl = fieldValue(row, 'baseUrl').trim();
    if (!isLikelyUrl(baseUrl)) {
      toaster.show({
        type: 'error',
        title: t('portal.catalogNeedUrl'),
      });
      return;
    }
    setBusyKey(row.casdoor.name);
    try {
      await api.request({
        path: 'enterpriseAppPortal/admin/applications',
        method: 'POST',
        json: {
          appCode: toAppCode(row.casdoor.name),
          casdoorAppKey: row.casdoor.name,
          name: fieldValue(row, 'name').trim(),
          appType: inferAppType(row.casdoor.name),
          baseUrl,
          targetPath: '/',
          enabled: true,
          sortOrder: Number(fieldValue(row, 'sortOrder') || 0) || 0,
        },
      });
      toaster.show({ type: 'success', title: t('portal.catalogImported') });
      reload();
    } catch (saveError) {
      toaster.show({
        type: 'error',
        title: errorMessage(saveError, t('portal.catalogFailed')),
      });
    } finally {
      setBusyKey(undefined);
    }
  };

  const patchLocal = async (
    row: MergedRow,
    patch: Partial<{
      name: string;
      baseUrl: string;
      enabled: boolean;
      sortOrder: number;
    }>,
  ) => {
    if (!canWrite || !row.local) return;
    if (patch.baseUrl !== undefined && !isLikelyUrl(patch.baseUrl)) {
      toaster.show({
        type: 'error',
        title: t('portal.catalogNeedUrl'),
      });
      return;
    }
    setBusyKey(row.casdoor.name);
    try {
      await api.request({
        path: `enterpriseAppPortal/admin/applications/${encodeURIComponent(row.local.appCode)}`,
        method: 'PATCH',
        json: patch,
      });
      toaster.show({ type: 'success', title: t('portal.catalogSaved') });
      reload();
    } catch (saveError) {
      toaster.show({
        type: 'error',
        title: errorMessage(saveError, t('portal.catalogFailed')),
      });
    } finally {
      setBusyKey(undefined);
    }
  };

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalCatalog')}
        description={t('settings.portalCatalogDescription')}
      />
      <Alert>
        <AlertTitle>{t('portal.catalogAuthorityTitle')}</AlertTitle>
        <AlertDescription>{t('portal.catalogAuthorityBody')}</AlertDescription>
      </Alert>
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={loading || busyKey !== undefined}
          onClick={() => reload()}
        >
          {t('portal.refreshFromCasdoor')}
        </Button>
      </div>
      {loading ? <SettingsLoading /> : null}
      {error ? <SettingsError error={error} retry={() => reload()} /> : null}
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='p-3'>{t('portal.casdoorAppKey')}</th>
              <th className='p-3'>{t('portal.appName')}</th>
              <th className='p-3'>{t('portal.baseUrl')}</th>
              <th className='p-3'>{t('portal.sortOrder')}</th>
              <th className='p-3'>{t('settings.status')}</th>
              <th className='p-3'>{t('settings.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.casdoor.name;
              const imported = row.local !== undefined;
              const busy = busyKey === key;
              return (
                <tr
                  key={`${row.casdoor.owner}/${key}`}
                  className='border-t align-top'
                >
                  <td className='p-3'>
                    <div className='font-mono'>{key}</div>
                    {imported ? (
                      <div className='text-xs text-muted-foreground'>
                        {t('portal.appCode')}: {row.local.appCode}
                      </div>
                    ) : (
                      <div className='text-xs text-muted-foreground'>
                        {t('portal.notInPortal')}
                      </div>
                    )}
                  </td>
                  <td className='p-3'>
                    <Input
                      value={fieldValue(row, 'name')}
                      disabled={!canWrite || busy}
                      onChange={(event) =>
                        setField(key, 'name', event.target.value)
                      }
                    />
                  </td>
                  <td className='p-3 min-w-[16rem]'>
                    <Label className='sr-only' htmlFor={`url-${key}`}>
                      {t('portal.baseUrl')}
                    </Label>
                    <Input
                      id={`url-${key}`}
                      value={fieldValue(row, 'baseUrl')}
                      disabled={!canWrite || busy}
                      onChange={(event) =>
                        setField(key, 'baseUrl', event.target.value)
                      }
                    />
                  </td>
                  <td className='p-3 w-24'>
                    <Input
                      value={fieldValue(row, 'sortOrder')}
                      disabled={!canWrite || busy}
                      onChange={(event) =>
                        setField(key, 'sortOrder', event.target.value)
                      }
                    />
                  </td>
                  <td className='p-3'>
                    {imported
                      ? row.local.enabled
                        ? t('settings.enabled')
                        : t('settings.disabled')
                      : t('portal.notInPortal')}
                  </td>
                  <td className='p-3'>
                    <div className='flex flex-wrap gap-2'>
                      {!imported ? (
                        <Button
                          size='sm'
                          disabled={!canWrite || busy}
                          onClick={() => void importApp(row)}
                        >
                          {t('portal.importToPortal')}
                        </Button>
                      ) : (
                        <>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={!canWrite || busy}
                            onClick={() =>
                              void patchLocal(row, {
                                name: fieldValue(row, 'name').trim(),
                                baseUrl: fieldValue(row, 'baseUrl').trim(),
                                sortOrder:
                                  Number(
                                    fieldValue(row, 'sortOrder') ||
                                      row.local!.sortOrder,
                                  ) || 0,
                              })
                            }
                          >
                            {t('settings.save')}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={!canWrite || busy}
                            onClick={() =>
                              void patchLocal(row, {
                                enabled: !row.local!.enabled,
                              })
                            }
                          >
                            {row.local.enabled
                              ? t('portal.removeFromPortal')
                              : t('portal.enableInPortal')}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
