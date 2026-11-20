import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';

interface ConnectionStatus {
  readonly ok: true;
  readonly organization: string;
  readonly applicationOwner: string;
  readonly permissionOwner: string;
  readonly auth: string;
}

interface CasdoorUser {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  /** Casdoor group ids (`owner/name`); shown as department. */
  readonly groups: readonly string[];
  readonly isForbidden: boolean;
  readonly isDeleted: boolean;
}

/** Drop the Casdoor owner prefix so `smartcore/JP_Dept` reads as `JP_Dept`. */
function formatGroupLabel(groupId: string): string {
  const slash = groupId.indexOf('/');
  return slash > 0 ? groupId.slice(slash + 1) : groupId;
}

function formatDepartments(groups: readonly string[] | undefined): string {
  if (!groups || groups.length === 0) return '—';
  return groups.map(formatGroupLabel).join(', ');
}

interface CasdoorApplication {
  readonly name: string;
  readonly displayName: string;
  readonly organization: string;
  readonly owner: string;
  readonly homepageUrl: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function PortalCasdoorConnectionPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [busy, setBusy] = useState<string>();
  const [connection, setConnection] = useState<ConnectionStatus>();
  const [users, setUsers] = useState<readonly CasdoorUser[]>([]);
  const [applications, setApplications] = useState<
    readonly CasdoorApplication[]
  >([]);
  const [lastError, setLastError] = useState<string>();

  const testConnection = async () => {
    setBusy('test');
    setLastError(undefined);
    try {
      const result = await api.request<{ data: ConnectionStatus }>({
        path: 'enterpriseAppPortal/admin/casdoor/testConnection',
        method: 'POST',
        json: {},
      });
      setConnection(result.data);
      toaster.show({ type: 'success', title: t('portal.connectionOk') });
    } catch (error) {
      setConnection(undefined);
      const message = errorMessage(error, t('portal.connectionFailed'));
      setLastError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      setBusy(undefined);
    }
  };

  const loadUsers = async () => {
    setBusy('users');
    setLastError(undefined);
    try {
      const result = await api.request<{
        data: readonly CasdoorUser[];
      }>({
        path: 'enterpriseAppPortal/admin/casdoor/users',
        method: 'GET',
        query: { page: 1, pageSize: 5 },
      });
      setUsers(result.data ?? []);
      toaster.show({ type: 'success', title: t('portal.usersLoaded') });
    } catch (error) {
      setUsers([]);
      const message = errorMessage(error, t('portal.usersFailed'));
      setLastError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      setBusy(undefined);
    }
  };

  const loadApplications = async () => {
    setBusy('apps');
    setLastError(undefined);
    try {
      const result = await api.request<{
        data: readonly CasdoorApplication[];
      }>({
        path: 'enterpriseAppPortal/admin/casdoor/applications',
        method: 'GET',
        query: { page: 1, pageSize: 50 },
      });
      setApplications(result.data ?? []);
      toaster.show({ type: 'success', title: t('portal.appsLoaded') });
    } catch (error) {
      setApplications([]);
      const message = errorMessage(error, t('portal.appsFailed'));
      setLastError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalCasdoorConnection')}
        description={t('settings.portalCasdoorConnectionDescription')}
      />
      <Alert>
        <AlertTitle>{t('portal.connectionHintTitle')}</AlertTitle>
        <AlertDescription>{t('portal.connectionHintBody')}</AlertDescription>
      </Alert>
      {lastError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('portal.connectionErrorTitle')}</AlertTitle>
          <AlertDescription>
            {lastError}. {t('portal.connectionEnvHint')}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className='flex flex-wrap gap-2'>
        <Button
          disabled={busy !== undefined}
          onClick={() => void testConnection()}
        >
          {t('portal.testConnection')}
        </Button>
        <Button
          variant='outline'
          disabled={busy !== undefined}
          onClick={() => void loadUsers()}
        >
          {t('portal.readUsers')}
        </Button>
        <Button
          variant='outline'
          disabled={busy !== undefined}
          onClick={() => void loadApplications()}
        >
          {t('portal.readApplications')}
        </Button>
      </div>
      {connection ? (
        <dl className='grid max-w-xl gap-2 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground'>
              {t('portal.organization')}
            </dt>
            <dd className='font-mono'>{connection.organization}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>{t('portal.authMode')}</dt>
            <dd className='font-mono'>{connection.auth}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('portal.applicationOwner')}
            </dt>
            <dd className='font-mono'>{connection.applicationOwner}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('portal.permissionOwner')}
            </dt>
            <dd className='font-mono'>{connection.permissionOwner}</dd>
          </div>
        </dl>
      ) : null}
      {users.length > 0 ? (
        <section className='space-y-2'>
          <h2 className='text-base font-medium'>{t('portal.sampleUsers')}</h2>
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-left'>
                <tr>
                  <th className='p-3'>{t('portal.userName')}</th>
                  <th className='p-3'>{t('portal.displayName')}</th>
                  <th className='p-3'>{t('settings.email')}</th>
                  <th className='p-3'>{t('portal.department')}</th>
                  <th className='p-3'>{t('settings.status')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className='border-t'>
                    <td className='p-3 font-mono'>{user.name}</td>
                    <td className='p-3'>{user.displayName || user.name}</td>
                    <td className='p-3 break-all'>{user.email || '—'}</td>
                    <td className='p-3'>{formatDepartments(user.groups)}</td>
                    <td className='p-3'>
                      {user.isDeleted || user.isForbidden
                        ? t('settings.disabled')
                        : t('settings.enabled')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {applications.length > 0 ? (
        <section className='space-y-2'>
          <h2 className='text-base font-medium'>
            {t('portal.sampleApplications')}
          </h2>
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-left'>
                <tr>
                  <th className='p-3'>{t('portal.appName')}</th>
                  <th className='p-3'>{t('portal.displayName')}</th>
                  <th className='p-3'>{t('portal.organization')}</th>
                  <th className='p-3'>{t('portal.baseUrl')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={`${app.owner}/${app.name}`} className='border-t'>
                    <td className='p-3 font-mono'>{app.name}</td>
                    <td className='p-3'>{app.displayName}</td>
                    <td className='p-3'>{app.organization}</td>
                    <td className='p-3 break-all'>{app.homepageUrl || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}
