import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';
import { PortalAgentGrantInstallDialog } from './portal-agent-grant-install-dialog.js';
import { usePolledAgentGrantOperation } from './portal-agent-grant-polling.js';
import { AgentGrantResultAlert } from './portal-agent-grant-result.js';
import {
  agentGrantApplicationsPath,
  agentGrantOperationPath,
  agentGrantReconcilePath,
  agentGrantResultKind,
  expertStatusText,
  operationNeedsOctopRefresh,
  selectAgentGrantApplications,
  type AgentGrantOperation,
  type EmployeeSyncFilter,
} from './portal-agent-grants-model.js';
import {
  formatTimestamp,
  readApplications,
  readOperation,
} from './portal-agent-grants-parsers.js';
import {
  AGENT_GRANT_FILTER_ALL,
  agentGrantUserKey,
  agentGrantUsersPath,
  filterAgentGrantUsers,
  formatDepartments,
  formatGroupLabel,
  readAgentGrantUsers,
  uniqueDepartments,
} from './portal-agent-users-model.js';

const AGENT_GRANTS = {
  resource: { type: 'settings', id: 'enterpriseAppPortal.agentGrants' },
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function syncLabel(
  employee: {
    readonly accountExists: boolean;
    readonly disabled: boolean;
    readonly syncedAt: string | null;
  },
  t: (key: string) => string,
): string {
  if (!employee.accountExists) {
    return t('settings.portalAgentGrantsUnsynced');
  }
  if (employee.disabled) {
    return t('settings.portalAgentGrantsAccountDisabled');
  }
  if (employee.syncedAt) return formatTimestamp(employee.syncedAt);
  return t('settings.portalAgentGrantsAccountExistsShort');
}

export default function PortalAgentUsersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canConfigure = useCan({ ...AGENT_GRANTS, action: 'configure' }).can;

  const [syncFilter, setSyncFilter] = useState<EmployeeSyncFilter>('all');
  const [appFilter, setAppFilter] = useState(AGENT_GRANT_FILTER_ALL);
  const [departmentFilter, setDepartmentFilter] = useState(
    AGENT_GRANT_FILTER_ALL,
  );
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [operation, setOperation] = useState<AgentGrantOperation>();

  const usersQuery = useSettingsData<{ data: readonly unknown[] }>(
    agentGrantUsersPath(),
  );
  const applicationsQuery = useSettingsData<{ data: readonly unknown[] }>(
    agentGrantApplicationsPath(),
  );

  const users = useMemo(
    () => readAgentGrantUsers(usersQuery.data ?? { data: [] }),
    [usersQuery.data],
  );
  const instances = useMemo(
    () =>
      selectAgentGrantApplications(
        readApplications(applicationsQuery.data ?? { data: [] }),
      ),
    [applicationsQuery.data],
  );
  const departments = useMemo(() => uniqueDepartments(users), [users]);
  const filtered = useMemo(
    () =>
      filterAgentGrantUsers(users, {
        appCode: appFilter,
        department: departmentFilter,
        sync: syncFilter,
        query,
      }),
    [appFilter, departmentFilter, query, syncFilter, users],
  );
  const selected = filtered.find(
    (row) => agentGrantUserKey(row) === selectedKey,
  );

  usePolledAgentGrantOperation(operation, setOperation);

  const instanceItems = useMemo(
    () => [
      {
        value: AGENT_GRANT_FILTER_ALL,
        label: t('settings.portalAgentUsersInstanceAll'),
      },
      ...instances.map((instance) => ({
        value: instance.appCode,
        label: instance.name,
      })),
    ],
    [instances, t],
  );
  const departmentItems = useMemo(
    () => [
      {
        value: AGENT_GRANT_FILTER_ALL,
        label: t('settings.portalAgentUsersDepartmentAll'),
      },
      ...departments.map((group) => ({
        value: group,
        label: formatGroupLabel(group),
      })),
    ],
    [departments, t],
  );

  function selectRow(key: string): void {
    setSelectedKey(key);
    setDialogOpen(false);
  }

  async function refreshOperation(): Promise<void> {
    if (!operation) return;
    if (operationNeedsOctopRefresh(agentGrantResultKind(operation))) {
      await reconcileOperation();
      return;
    }
    try {
      const response = await api.request<unknown>({
        path: agentGrantOperationPath(operation.id),
      });
      setOperation(readOperation(response));
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    }
  }

  async function reconcileOperation(): Promise<void> {
    if (!operation) return;
    try {
      const response = await api.request<unknown>({
        method: 'POST',
        path: agentGrantReconcilePath(operation.id),
      });
      setOperation(readOperation(response));
      usersQuery.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    }
  }

  if (usersQuery.loading) return <SettingsLoading />;
  if (usersQuery.error) {
    return (
      <SettingsError
        error={usersQuery.error}
        retry={() => usersQuery.reload()}
      />
    );
  }

  const primaryLabel = selected?.accountExists
    ? t('settings.portalAgentGrantsInstallExperts')
    : t('settings.portalAgentUsersInitialize');
  const canOpen = Boolean(selected) && !selected?.disabled && canConfigure;

  return (
    <PageContainer>
      <PageHeader
        title={t('settings.portalAgentUsers')}
        description={t('settings.portalAgentUsersDescription')}
      />
      {!canConfigure ? (
        <Alert className='mb-4'>
          <AlertTitle>{t('settings.portalAgentGrantsReadOnly')}</AlertTitle>
        </Alert>
      ) : null}

      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-medium'>
          {t('settings.portalAgentUsersCount', { count: filtered.length })}
        </h2>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <div
            className='inline-flex rounded-md border p-0.5'
            role='group'
            aria-label={t('settings.portalAgentUsersSyncFilter')}
          >
            {(
              [
                ['all', 'settings.portalAgentUsersSyncAll'],
                ['unsynced', 'settings.portalAgentUsersSyncUnsynced'],
                ['synced', 'settings.portalAgentUsersSyncSynced'],
              ] as const
            ).map(([value, labelKey]) => (
              <Button
                key={value}
                type='button'
                size='sm'
                variant={syncFilter === value ? 'secondary' : 'ghost'}
                className='h-7 px-2.5'
                onClick={() => setSyncFilter(value)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          <Select
            items={instanceItems}
            value={appFilter}
            onValueChange={(value) => {
              const next = String(value ?? '');
              if (next) setAppFilter(next);
            }}
          >
            <SelectTrigger
              className='w-44'
              aria-label={t('settings.portalAgentUsersInstance')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {instanceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={departmentItems}
            value={departmentFilter}
            onValueChange={(value) => {
              const next = String(value ?? '');
              if (next) setDepartmentFilter(next);
            }}
          >
            <SelectTrigger
              className='w-44'
              aria-label={t('settings.portalAgentUsersDepartment')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className='w-48'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.portalAgentUsersSearch')}
            aria-label={t('settings.portalAgentUsersSearch')}
          />
          <Button
            type='button'
            disabled={!canOpen}
            onClick={() => setDialogOpen(true)}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('settings.portalAgentUsersEmpty')}
        </p>
      ) : (
        <div className='max-h-[70vh] overflow-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-10' />
                <TableHead>
                  {t('settings.portalAgentUsersColumnUser')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnEmail')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnAccount')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnDepartment')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnInstance')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnSync')}
                </TableHead>
                <TableHead>
                  {t('settings.portalAgentUsersColumnExperts')}
                </TableHead>
                <TableHead className='w-24'>
                  {t('settings.portalAgentUsersColumnActions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((employee) => {
                const key = agentGrantUserKey(employee);
                const rowSelected = key === selectedKey;
                return (
                  <TableRow
                    key={key}
                    data-state={rowSelected ? 'selected' : undefined}
                    className='cursor-pointer'
                    onClick={() => selectRow(key)}
                  >
                    <TableCell>
                      <RadioGroup value={selectedKey}>
                        <RadioGroupItem value={key} />
                      </RadioGroup>
                    </TableCell>
                    <TableCell className='font-medium'>
                      {employee.displayName}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {employee.email || '—'}
                    </TableCell>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{formatDepartments(employee.groups)}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{employee.appName}</div>
                      <div className='text-xs text-muted-foreground'>
                        {employee.appCode}
                      </div>
                    </TableCell>
                    <TableCell>{syncLabel(employee, t)}</TableCell>
                    <TableCell>
                      {employee.experts.length > 0 ? (
                        <ul className='space-y-1 text-xs'>
                          {employee.experts.map((expert) => (
                            <li key={expert.agentId}>
                              {expert.name || expert.agentId} ({expert.agentId}){' '}
                              ·{' '}
                              {expertStatusText(
                                expert,
                                t('settings.portalAgentGrantsBootstrapPending'),
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : employee.accountExists ? (
                        t('settings.portalAgentGrantsNoExperts')
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Future per-user management actions go here. */}
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled
                        onClick={(event) => event.stopPropagation()}
                      >
                        {t('settings.portalAgentUsersManage')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className='mt-4'>
        <AgentGrantResultAlert
          operation={operation}
          onRefresh={() => void refreshOperation()}
          onReconcile={() => void reconcileOperation()}
        />
      </div>

      {selected ? (
        <PortalAgentGrantInstallDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          appCode={selected.appCode}
          employee={selected}
          onCompleted={(created) => {
            setOperation(created);
            usersQuery.reload();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
