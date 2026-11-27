import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LayoutGridIcon, ExternalLinkIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { SettingsError, SettingsLoading } from '../settings/shared.js';
import { useSettingsData } from '../settings/hooks.js';

interface AuthorizedApplication {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly businessCenter: string | null;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly health: 'healthy' | 'unhealthy' | 'unknown';
  readonly isDefault: boolean;
}

interface EmployeeCatalog {
  readonly applications: readonly AuthorizedApplication[];
  readonly autoLaunchMode: 'disabled' | 'if_single' | 'default_if_valid';
  readonly suggestedAppCode: string | null;
  readonly isolationNotice: boolean;
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const catalog = useSettingsData<{ data: EmployeeCatalog }>(
    'enterpriseAppPortal/applications',
  );
  const [busy, setBusy] = useState<string>();
  const [prefsBusy, setPrefsBusy] = useState(false);
  const data = catalog.data?.data;

  const launch = useCallback(
    async (appCode: string) => {
      setBusy(appCode);
      try {
        const result = await api.request<{
          data: { url: string; name: string };
        }>({
          path: `enterpriseAppPortal/applications/${encodeURIComponent(appCode)}/launch`,
          method: 'POST',
          json: {},
        });
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
        toaster.show({
          type: 'success',
          title: t('portal.launchOpened', { name: result.data.name }),
        });
      } catch (error) {
        toaster.show({
          type: 'error',
          title:
            error instanceof Error ? error.message : t('portal.launchFailed'),
        });
      } finally {
        setBusy(undefined);
      }
    },
    [api, t, toaster],
  );

  const savePrefs = useCallback(
    async (autoLaunchMode: EmployeeCatalog['autoLaunchMode']) => {
      setPrefsBusy(true);
      try {
        await api.request({
          path: 'enterpriseAppPortal/preferences',
          method: 'PUT',
          json: {
            autoLaunchMode,
            defaultAppCode: data?.applications.find((row) => row.isDefault)
              ?.appCode,
          },
        });
        catalog.reload();
        toaster.show({ type: 'success', title: t('portal.prefsSaved') });
      } catch (error) {
        toaster.show({
          type: 'error',
          title:
            error instanceof Error ? error.message : t('portal.prefsFailed'),
        });
      } finally {
        setPrefsBusy(false);
      }
    },
    [api, catalog, data, t, toaster],
  );

  const setDefault = useCallback(
    async (appCode: string) => {
      setPrefsBusy(true);
      try {
        await api.request({
          path: 'enterpriseAppPortal/preferences',
          method: 'PUT',
          json: {
            autoLaunchMode: data?.autoLaunchMode ?? 'disabled',
            defaultAppCode: appCode,
          },
        });
        catalog.reload();
        toaster.show({ type: 'success', title: t('portal.defaultSaved') });
      } catch (error) {
        toaster.show({
          type: 'error',
          title:
            error instanceof Error ? error.message : t('portal.prefsFailed'),
        });
      } finally {
        setPrefsBusy(false);
      }
    },
    [api, catalog, data, t, toaster],
  );

  useEffect(() => {
    if (!data?.suggestedAppCode || busy) return;
    const suggested = data.applications.find(
      (row) => row.appCode === data.suggestedAppCode,
    );
    if (!suggested) return;
    const timer = window.setTimeout(() => {
      void launch(suggested.appCode);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [busy, data, launch]);

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <PageHeader
        title={t('portal.title')}
        description={t('portal.description')}
      />
      {data?.isolationNotice ? (
        <Alert>
          <AlertTitle>{t('portal.isolationTitle')}</AlertTitle>
          <AlertDescription>{t('portal.isolationBody')}</AlertDescription>
        </Alert>
      ) : null}
      {catalog.loading && !data ? <SettingsLoading /> : null}
      {catalog.error ? (
        <SettingsError error={catalog.error} retry={catalog.reload} />
      ) : null}
      {data ? (
        <>
          <section className='flex flex-wrap items-end justify-between gap-3'>
            <div className='flex flex-col gap-1'>
              <h2 className='text-base font-medium'>
                {t('portal.authorized')}
              </h2>
              <p className='text-sm text-muted-foreground'>
                {t('portal.authorizedHint')}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {(
                [
                  ['disabled', 'portal.autoLaunchDisabled'],
                  ['if_single', 'portal.autoLaunchIfSingle'],
                  ['default_if_valid', 'portal.autoLaunchDefault'],
                ] as const
              ).map(([mode, key]) => (
                <Button
                  key={mode}
                  size='sm'
                  variant={data.autoLaunchMode === mode ? 'default' : 'outline'}
                  disabled={prefsBusy}
                  onClick={() => void savePrefs(mode)}
                >
                  {t(key)}
                </Button>
              ))}
            </div>
          </section>
          {data.applications.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{t('portal.empty')}</p>
          ) : (
            <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
              {data.applications.map((app) => (
                <li key={app.appCode} className='flex'>
                  <Card className='flex flex-1 flex-col'>
                    <CardHeader>
                      <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <LayoutGridIcon className='size-4' aria-hidden />
                        {app.appType}
                        {app.isDefault ? ` · ${t('portal.defaultApp')}` : ''}
                      </p>
                      <CardTitle>{app.name}</CardTitle>
                      <CardDescription>
                        {app.description ?? app.businessCenter ?? app.appCode}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className='mt-auto flex flex-wrap gap-2'>
                      <Button
                        disabled={
                          busy === app.appCode || app.health === 'unhealthy'
                        }
                        onClick={() => void launch(app.appCode)}
                      >
                        <ExternalLinkIcon />
                        {t('portal.open')}
                      </Button>
                      <Button
                        variant='outline'
                        disabled={prefsBusy || app.isDefault}
                        onClick={() => void setDefault(app.appCode)}
                      >
                        {t('portal.setDefault')}
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          <p className='text-sm text-muted-foreground'>
            {t('portal.userConfigHint')}{' '}
            <Link className='text-primary hover:underline' to='/settings/users'>
              {t('portal.userConfigLink')}
            </Link>
          </p>
        </>
      ) : null}
    </PageContainer>
  );
}
