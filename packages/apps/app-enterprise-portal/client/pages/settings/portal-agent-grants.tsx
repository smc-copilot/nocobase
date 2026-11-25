import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { ConfirmAction, SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';
import {
  PortalAgentGrantInstallDialog,
  type AgentGrantInstallTarget,
} from './portal-agent-grant-install-dialog.js';
import { usePolledAgentGrantOperation } from './portal-agent-grant-polling.js';
import { AgentGrantResultAlert } from './portal-agent-grant-result.js';
import {
  asRecord,
  formatTimestamp,
  readApplications,
  readEmployees,
  readOctopState,
  readOperation,
} from './portal-agent-grants-parsers.js';
import {
  agentGrantApplicationPath,
  agentGrantApplicationsPath,
  agentGrantEmployeeRevokePath,
  agentGrantOctopStatePath,
  agentGrantOperationPath,
  agentGrantReconcilePath,
  agentGrantResultKind,
  expertStatusText,
  operationNeedsOctopRefresh,
  selectAgentGrantApplications,
  type AgentGrantEmployee,
  type AgentGrantOperation,
  type EmployeeSyncFilter,
  type OctopAccountState,
} from './portal-agent-grants-model.js';

const AGENT_GRANTS = {
  resource: { type: 'settings', id: 'enterpriseAppPortal.agentGrants' },
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function employeeSyncColumn(
  employee: AgentGrantEmployee,
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

export default function PortalAgentGrantsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canConfigure = useCan({ ...AGENT_GRANTS, action: 'configure' }).can;
  const employeeRequestIdRef = useRef(0);

  const [appCode, setAppCode] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [syncFilter, setSyncFilter] = useState<EmployeeSyncFilter>('all');
  const [userSort, setUserSort] = useState<'asc' | 'desc'>('asc');
  const [octopState, setOctopState] = useState<
    OctopAccountState | 'loading' | 'error' | undefined
  >();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [operation, setOperation] = useState<AgentGrantOperation>();
  const [removeTarget, setRemoveTarget] = useState<AgentGrantEmployee>();
  const [removing, setRemoving] = useState(false);

  const applicationsQuery = useSettingsData<{ data: readonly unknown[] }>(
    agentGrantApplicationsPath(),
  );

  const applications = useMemo(
    () =>
      selectAgentGrantApplications(
        readApplications(applicationsQuery.data ?? { data: [] }),
      ),
    [applicationsQuery.data],
  );

  const employeesQuery = useSettingsData<{ data: readonly unknown[] }>(
    appCode
      ? agentGrantApplicationPath(appCode, 'employees')
      : `${agentGrantApplicationsPath()}/_/employees`,
    { active: Boolean(appCode) },
  );

  const employees = useMemo(
    () => (appCode ? readEmployees(employeesQuery.data ?? { data: [] }) : []),
    [appCode, employeesQuery.data],
  );

  const selectedEmployee = employees.find((row) => row.id === employeeId);
  const isNewUser =
    octopState !== undefined &&
    octopState !== 'loading' &&
    octopState !== 'error' &&
    !octopState.accountExists;
  const liveOctop =
    octopState && octopState !== 'loading' && octopState !== 'error'
      ? octopState
      : undefined;
  const dialogEmployee = useMemo<AgentGrantInstallTarget>(() => {
    if (!selectedEmployee) {
      return {
        id: '',
        name: '',
        displayName: '',
        email: '',
        accountExists: false,
        experts: [],
      };
    }
    return {
      id: selectedEmployee.id,
      name: selectedEmployee.name,
      displayName: selectedEmployee.displayName,
      email: selectedEmployee.email,
      accountExists: liveOctop?.accountExists ?? selectedEmployee.accountExists,
      experts: liveOctop?.experts ?? selectedEmployee.experts,
    };
  }, [liveOctop, selectedEmployee]);

  const filteredEmployees = useMemo(() => {
    const needle = employeeQuery.trim().toLowerCase();
    const matched = employees.filter((employee) => {
      if (syncFilter === 'synced' && !employee.accountExists) return false;
      if (syncFilter === 'unsynced' && employee.accountExists) return false;
      if (!needle) return true;
      return [employee.displayName, employee.name, employee.email].some(
        (value) => value.toLowerCase().includes(needle),
      );
    });
    const direction = userSort === 'asc' ? 1 : -1;
    return matched.sort(
      (left, right) =>
        direction *
        left.displayName.localeCompare(right.displayName, undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
    );
  }, [employeeQuery, employees, syncFilter, userSort]);

  usePolledAgentGrantOperation(operation, setOperation);

  function selectApplication(nextAppCode: string): void {
    setAppCode(nextAppCode);
    setEmployeeId('');
    setEmployeeQuery('');
    setSyncFilter('all');
    setOctopState(undefined);
    setOperation(undefined);
    setDialogOpen(false);
    ++employeeRequestIdRef.current;
  }

  async function selectEmployee(
    nextEmployeeId: string,
    options?: { readonly keepOperation?: boolean },
  ): Promise<void> {
    setEmployeeId(nextEmployeeId);
    if (!options?.keepOperation) setOperation(undefined);
    setDialogOpen(false);
    if (!appCode || !nextEmployeeId) {
      setOctopState(undefined);
      return;
    }
    setOctopState('loading');
    const current = ++employeeRequestIdRef.current;
    try {
      const response = await api.request<unknown>({
        path: agentGrantOctopStatePath(appCode, nextEmployeeId),
      });
      if (current !== employeeRequestIdRef.current) return;
      const state = readOctopState(response);
      setOctopState(state ?? 'error');
    } catch {
      if (current !== employeeRequestIdRef.current) return;
      setOctopState('error');
    }
  }

  function openDialog(): void {
    if (!selectedEmployee) return;
    setDialogOpen(true);
  }

  function handleGrantCompleted(created: AgentGrantOperation): void {
    setOperation(created);
    employeesQuery.reload();
    if (selectedEmployee) {
      void selectEmployee(selectedEmployee.id, { keepOperation: true });
    }
  }

  async function confirmRemoveEmployee(): Promise<void> {
    if (!removeTarget || !appCode) return;
    setRemoving(true);
    try {
      const response = await api.request<unknown>({
        method: 'DELETE',
        path: agentGrantEmployeeRevokePath(appCode, removeTarget.id),
      });
      const payload = asRecord(asRecord(response)?.data);
      const stillAuthorized = payload?.stillAuthorized === true;
      const removedId = removeTarget.id;
      setRemoveTarget(undefined);
      if (employeeId === removedId) {
        setEmployeeId('');
        setOctopState(undefined);
        setOperation(undefined);
      }
      employeesQuery.reload();
      toaster.show({
        type: stillAuthorized ? 'warning' : 'success',
        title: stillAuthorized
          ? t('settings.portalAgentGrantsRemoveStillAuthorized')
          : t('settings.portalAgentGrantsRemoveDone'),
      });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsRemoveFailed')),
      });
    } finally {
      setRemoving(false);
    }
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
      if (selectedEmployee) {
        await selectEmployee(selectedEmployee.id, { keepOperation: true });
      }
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    }
  }

  if (applicationsQuery.loading) return <SettingsLoading />;
  if (applicationsQuery.error) {
    return (
      <SettingsError
        error={applicationsQuery.error}
        retry={() => applicationsQuery.reload()}
      />
    );
  }

  const accountBlocked =
    octopState === 'loading' ||
    octopState === 'error' ||
    (octopState !== undefined && octopState.disabled);
  const canOpen = Boolean(selectedEmployee) && !accountBlocked && canConfigure;

  return (
    <PageContainer>
      <PageHeader
        title={t('settings.portalAgentGrants')}
        description={t('settings.portalAgentGrantsDescription')}
      />
      {!canConfigure ? (
        <Alert className='mb-4'>
          <AlertTitle>{t('settings.portalAgentGrantsReadOnly')}</AlertTitle>
        </Alert>
      ) : null}

      <div className='mb-4 grid gap-4 lg:grid-cols-[240px_1fr]'>
        <section className='rounded-md border p-3'>
          <h2 className='mb-2 text-sm font-medium'>
            {t('settings.portalAgentGrantsApplications')}
          </h2>
          {applications.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('settings.portalAgentGrantsEmptyApplications')}
            </p>
          ) : (
            <RadioGroup
              value={appCode}
              onValueChange={(value) => {
                void selectApplication(String(value ?? ''));
              }}
            >
              {applications.map((application) => {
                const id = `agent-grant-app-${application.appCode}`;
                return (
                  <div
                    key={application.appCode}
                    className='mb-2 flex cursor-pointer items-start gap-2 rounded-md border p-2'
                  >
                    <RadioGroupItem id={id} value={application.appCode} />
                    <div className='grid gap-0.5'>
                      <Label htmlFor={id} className='font-normal'>
                        {application.name}
                      </Label>
                      <p className='text-xs text-muted-foreground'>
                        {application.appCode}
                      </p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </section>

        <section className='rounded-md border p-3'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-sm font-medium'>
              {t('settings.portalAgentGrantsEmployees', {
                count: employees.length,
              })}
            </h2>
            {appCode ? (
              <div className='flex flex-wrap items-center justify-end gap-2'>
                <div
                  className='inline-flex rounded-md border p-0.5'
                  role='group'
                  aria-label={t('settings.portalAgentGrantsSyncFilter')}
                >
                  {(
                    [
                      ['all', 'settings.portalAgentGrantsSyncFilterAll'],
                      [
                        'unsynced',
                        'settings.portalAgentGrantsSyncFilterUnsynced',
                      ],
                      ['synced', 'settings.portalAgentGrantsSyncFilterSynced'],
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
                <Input
                  className='w-48'
                  value={employeeQuery}
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder={t('settings.portalAgentGrantsSearchEmployees')}
                  aria-label={t('settings.portalAgentGrantsSearchEmployees')}
                />
                <Button
                  type='button'
                  disabled={!canOpen}
                  onClick={() => openDialog()}
                >
                  {isNewUser
                    ? t('settings.portalAgentGrantsCreate')
                    : t('settings.portalAgentGrantsInstallExperts')}
                </Button>
              </div>
            ) : null}
          </div>

          {!appCode ? (
            <p className='text-sm text-muted-foreground'>
              {t('settings.portalAgentGrantsSelectApplication')}
            </p>
          ) : employeesQuery.loading ? (
            <SettingsLoading />
          ) : (
            <div className='max-h-[70vh] overflow-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10' />
                    <TableHead>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='-ml-3 h-8 gap-1 px-2'
                        onClick={() =>
                          setUserSort((current) =>
                            current === 'asc' ? 'desc' : 'asc',
                          )
                        }
                      >
                        {t('settings.portalAgentGrantsColumnUser')}
                        {userSort === 'asc' ? (
                          <ArrowUpIcon className='size-3.5' />
                        ) : (
                          <ArrowDownIcon className='size-3.5' />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>
                      {t('settings.portalAgentGrantsColumnEmail')}
                    </TableHead>
                    <TableHead>
                      {t('settings.portalAgentGrantsColumnAccount')}
                    </TableHead>
                    <TableHead>
                      {t('settings.portalAgentGrantsColumnSync')}
                    </TableHead>
                    <TableHead>
                      {t('settings.portalAgentGrantsColumnExperts')}
                    </TableHead>
                    {canConfigure ? (
                      <TableHead className='w-24'>
                        {t('settings.portalAgentGrantsColumnActions')}
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((employee) => {
                    const selected = employee.id === employeeId;
                    const rowState = selected ? octopState : undefined;
                    const experts =
                      rowState && rowState !== 'loading' && rowState !== 'error'
                        ? rowState.experts
                        : employee.experts;
                    return (
                      <TableRow
                        key={employee.id}
                        data-state={selected ? 'selected' : undefined}
                        className='cursor-pointer'
                        onClick={() => {
                          void selectEmployee(employee.id);
                        }}
                      >
                        <TableCell>
                          <RadioGroup value={employeeId}>
                            <RadioGroupItem value={employee.id} />
                          </RadioGroup>
                        </TableCell>
                        <TableCell className='font-medium'>
                          {employee.displayName}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {employee.email || '—'}
                        </TableCell>
                        <TableCell>{employee.name}</TableCell>
                        <TableCell>{employeeSyncColumn(employee, t)}</TableCell>
                        <TableCell>
                          {experts.length > 0 ? (
                            <ul className='space-y-1 text-xs'>
                              {experts.map((expert) => (
                                <li key={expert.agentId}>
                                  {expert.name || expert.agentId} (
                                  {expert.agentId}) ·{' '}
                                  {expertStatusText(
                                    expert,
                                    t(
                                      'settings.portalAgentGrantsBootstrapPending',
                                    ),
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
                        {canConfigure ? (
                          <TableCell>
                            {!employee.accountExists ? (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='text-destructive'
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRemoveTarget(employee);
                                }}
                              >
                                {t('settings.portalAgentGrantsRemove')}
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <AgentGrantResultAlert
        operation={operation}
        onRefresh={() => void refreshOperation()}
        onReconcile={() => void reconcileOperation()}
      />

      <PortalAgentGrantInstallDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appCode={appCode}
        employee={dialogEmployee}
        onCompleted={handleGrantCompleted}
      />

      <ConfirmAction
        open={removeTarget !== undefined}
        title={t('settings.portalAgentGrantsRemoveTitle')}
        description={
          removeTarget
            ? `${t('settings.portalAgentGrantsRemoveHint')} (${removeTarget.displayName})`
            : t('settings.portalAgentGrantsRemoveHint')
        }
        confirmLabel={t('settings.portalAgentGrantsRemove')}
        busy={removing}
        onCancel={() => {
          if (!removing) setRemoveTarget(undefined);
        }}
        onConfirm={() => {
          void confirmRemoveEmployee();
        }}
      />
    </PageContainer>
  );
}
