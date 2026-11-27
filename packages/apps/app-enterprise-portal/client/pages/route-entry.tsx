import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LayoutGridIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

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
import { SettingsError, SettingsLoading } from './settings/shared.js';
import { useSettingsData } from './settings/hooks.js';

interface RoutingApplication {
  readonly appCode: string;
  readonly name: string;
  readonly appType: string;
  readonly businessCenter: string | null;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly health: 'healthy' | 'unhealthy' | 'unknown';
  readonly isDefault: boolean;
}

interface RouteCandidates {
  readonly applications: readonly RoutingApplication[];
  readonly autoLaunchMode: 'disabled' | 'if_single' | 'default_if_valid';
  readonly suggestedAppCode: string | null;
  readonly routingEnabled: boolean;
}

interface IssuedTicket {
  readonly ticket: string;
  readonly appCode: string;
  readonly expiresIn: number;
  readonly requestId: string;
  readonly submission: {
    readonly method: 'POST';
    readonly url: string;
  };
}

function reasonMessage(error: unknown, t: (key: string) => string): string {
  if (!(error instanceof Error)) return t('portal.routeEntry.failed');
  const reason =
    'reason' in error &&
    typeof (error as { reason?: unknown }).reason === 'string'
      ? (error as { reason: string }).reason
      : undefined;
  switch (reason) {
    case 'IDENTITY_BINDING_REQUIRED':
      return t('portal.routeEntry.bindingRequired');
    case 'IDENTITY_BINDING_AMBIGUOUS':
      return t('portal.routeEntry.bindingAmbiguous');
    case 'ROUTE_SELECTION_REQUIRED':
      return t('portal.routeEntry.selectionRequired');
    case 'APP_ACCESS_DENIED':
      return t('portal.routeEntry.accessDenied');
    case 'ROUTE_DEPENDENCY_UNAVAILABLE':
      return t('portal.routeEntry.unavailable');
    default:
      return error.message || t('portal.routeEntry.failed');
  }
}

export default function RouteEntryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const candidates = useSettingsData<{ data: RouteCandidates }>(
    'enterpriseAppPortal/routeTickets/candidates',
  );
  const data = candidates.data?.data;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState<IssuedTicket>();
  const formRef = useRef<HTMLFormElement>(null);
  const autoStartedRef = useRef(false);

  const issueAndSubmit = useCallback(
    async (appCode: string, mode: 'auto' | 'selected') => {
      setBusy(appCode);
      setError(undefined);
      try {
        const result = await api.request<{ data: IssuedTicket }>({
          path: 'enterpriseAppPortal/routeTickets',
          method: 'POST',
          json: { appCode, mode },
        });
        setSubmitting(result.data);
      } catch (err) {
        setError(reasonMessage(err, t));
        setBusy(undefined);
      }
    },
    [api, t],
  );

  useEffect(() => {
    if (!submitting || !formRef.current) return;
    formRef.current.submit();
  }, [submitting]);

  useEffect(() => {
    if (!data?.routingEnabled || autoStartedRef.current || busy || submitting) {
      return;
    }
    if (!data.suggestedAppCode) return;
    const suggested = data.applications.find(
      (row) => row.appCode === data.suggestedAppCode,
    );
    if (!suggested || suggested.health === 'unhealthy') return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void issueAndSubmit(suggested.appCode, 'auto');
    }, 400);
    return () => window.clearTimeout(timer);
  }, [busy, data, issueAndSubmit, submitting]);

  if (submitting) {
    return (
      <PageContainer className='mx-auto max-w-lg space-y-4'>
        <PageHeader
          title={t('portal.routeEntry.title')}
          description={t('portal.routeEntry.redirecting')}
        />
        <form
          ref={formRef}
          method='POST'
          action={submitting.submission.url}
          acceptCharset='UTF-8'
        >
          <input type='hidden' name='ticket' value={submitting.ticket} />
          <noscript>
            <Button type='submit'>{t('portal.routeEntry.continue')}</Button>
          </noscript>
        </form>
      </PageContainer>
    );
  }

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <PageHeader
        title={t('portal.routeEntry.title')}
        description={t('portal.routeEntry.description')}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('portal.routeEntry.errorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {candidates.loading && !data ? <SettingsLoading /> : null}
      {candidates.error ? (
        <SettingsError error={candidates.error} retry={candidates.reload} />
      ) : null}
      {data && !data.routingEnabled ? (
        <Alert>
          <AlertTitle>{t('portal.routeEntry.disabledTitle')}</AlertTitle>
          <AlertDescription>
            {t('portal.routeEntry.disabledBody')}
          </AlertDescription>
        </Alert>
      ) : null}
      {data?.routingEnabled ? (
        <>
          {data.applications.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('portal.routeEntry.empty')}
            </p>
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
                    <CardFooter className='mt-auto'>
                      <Button
                        disabled={
                          busy === app.appCode || app.health === 'unhealthy'
                        }
                        onClick={() =>
                          void issueAndSubmit(app.appCode, 'selected')
                        }
                      >
                        {t('portal.routeEntry.continue')}
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
