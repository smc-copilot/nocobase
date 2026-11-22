import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Switch } from '#components/ui/switch';
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
import {
  agentGrantApplicationPath,
  agentGrantApplicationsPath,
  agentGrantOctopStatePath,
  agentGrantOperationPath,
  agentGrantReconcilePath,
  agentGrantResultKind,
  buildAgentGrantCreateBody,
  defaultRoleId,
  emptyCreateDraft,
  expertStatusText,
  filterPublishedTemplates,
  installedTemplateIds,
  normalizeOctopIdentityField,
  selectAgentGrantApplications,
  selectableRoles,
  toggleExpertTemplate,
  withRoleDefaults,
  type AgentGrantApplication,
  type AgentGrantCreateOptions,
  type AgentGrantEmployee,
  type AgentGrantOperation,
  type CreateDraft,
  type EmployeeSyncFilter,
  type InstalledExpert,
  type OctopAccountState,
  type PublishedTemplate,
} from './portal-agent-grants-model.js';

const AGENT_GRANTS = {
  resource: { type: 'settings', id: 'enterpriseAppPortal.agentGrants' },
} as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function readStringList(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function readApplications(data: unknown): AgentGrantApplication[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.appCode !== 'string') return [];
    return [
      {
        appCode: row.appCode,
        name: typeof row.name === 'string' ? row.name : row.appCode,
        appType: typeof row.appType === 'string' ? row.appType : '',
        casdoorAppKey:
          typeof row.casdoorAppKey === 'string' ? row.casdoorAppKey : '',
        agentGrantsEnabled: row.agentGrantsEnabled === true,
        apiBaseUrlConfigured:
          row.apiBaseUrlConfigured === true ||
          (typeof row.apiBaseUrl === 'string' && row.apiBaseUrl.length > 0),
        apiAuthMode:
          typeof row.apiAuthMode === 'string' ? row.apiAuthMode : null,
      },
    ];
  });
}

function readEmployees(data: unknown): AgentGrantEmployee[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = firstString(row, 'casdoorUserId', 'casdoor_user_id', 'id');
    const name = firstString(row, 'username', 'name');
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        displayName:
          typeof row.displayName === 'string' && row.displayName.trim() !== ''
            ? row.displayName
            : name,
        email: typeof row.email === 'string' ? row.email : '',
        isForbidden: row.isForbidden === true,
        grantSource:
          row.grantSource === 'inherited' || row.grantSource === 'direct'
            ? row.grantSource
            : undefined,
        accountExists: row.accountExists === true,
        octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
        disabled: row.disabled === true,
        syncedAt: firstString(row, 'syncedAt', 'synced_at') || null,
        experts: readExperts(row.experts),
      },
    ];
  });
}

function readExperts(value: unknown): InstalledExpert[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const agentId = firstString(row, 'agentId', 'agent_id');
    if (!agentId) return [];
    const published = firstString(
      row,
      'publishedExpertId',
      'published_expert_id',
    );
    return [
      {
        agentId,
        publishedExpertId: published || null,
        name: firstString(row, 'name'),
        state: firstString(row, 'state'),
        bootstrapPending:
          row.bootstrapPending === true || row.bootstrap_pending === true,
      },
    ];
  });
}

function readOctopState(data: unknown): OctopAccountState | undefined {
  const body = asRecord(data);
  const row = asRecord(body?.data);
  if (!row) return undefined;
  return {
    accountExists: row.accountExists === true,
    disabled: row.disabled === true,
    octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
    experts: readExperts(row.experts),
  };
}

function readTemplates(data: unknown): PublishedTemplate[] {
  const record = asRecord(data);
  const rows = Array.isArray(record?.data) ? record.data : [];
  return rows.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = firstString(row, 'id');
    if (!id) return [];
    return [
      {
        id,
        name: firstString(row, 'name') || id,
        description: firstString(row, 'description') || null,
        creatorUsername:
          firstString(row, 'creatorUsername', 'creator_username') || null,
        updatedAt: firstString(row, 'updatedAt', 'updated_at') || null,
      },
    ];
  });
}

function readCreateOptions(data: unknown): AgentGrantCreateOptions {
  const body = asRecord(data);
  const row = asRecord(body?.data) ?? {};
  const roles = (Array.isArray(row.roles) ? row.roles : []).flatMap((item) => {
    const role = asRecord(item);
    if (!role) return [];
    const id = firstString(role, 'id', 'userRoleId', 'user_role_id');
    if (!id) return [];
    return [
      {
        id,
        name: firstString(role, 'name', 'userRoleName', 'user_role_name') || id,
        systemRole: firstString(role, 'systemRole', 'system_role') || null,
        permissions: readStringList(role, 'permissions'),
        maxAgents: readNumber(role, 'maxAgents', 'max_agents'),
        tokenQuota: readNumber(role, 'tokenQuota', 'token_quota'),
        workspaceRootDir:
          firstString(role, 'workspaceRootDir', 'workspace_root_dir') || null,
        allowedBackendTypes: readStringList(
          role,
          'allowedBackendTypes',
          'allowed_backend_types',
        ),
      },
    ];
  });
  return {
    roles: selectableRoles(roles),
    ldapConfigured: row.ldapConfigured === true,
    allowedBackendTypes: ['docker'],
    expertTemplateSource: 'published',
  };
}

function readOperation(data: unknown): AgentGrantOperation | undefined {
  const body = asRecord(data);
  const row = asRecord(body?.data);
  if (!row || typeof row.id !== 'string') return undefined;
  return {
    id: row.id,
    status: typeof row.status === 'string' ? row.status : '',
    operationMode: firstString(row, 'operationMode', 'operation_mode') || null,
    selectedExpertCount: readNumber(row, 'selectedExpertCount') ?? 0,
    completedExpertCount: readNumber(row, 'completedExpertCount') ?? 0,
    failedExpertCount: readNumber(row, 'failedExpertCount') ?? 0,
    skippedExpertCount: readNumber(row, 'skippedExpertCount') ?? 0,
    bootstrapStatus:
      firstString(row, 'bootstrapStatus', 'bootstrap_status') || null,
    agentId: firstString(row, 'agentId', 'agent_id') || null,
    publishedExpertId:
      firstString(
        row,
        'publishedExpertId',
        'published_expert_id',
        'expertTemplateId',
      ) || null,
    octopUserId: firstString(row, 'octopUserId', 'octop_user_id') || null,
    errorCode: firstString(row, 'errorCode', 'error_code') || null,
    errorMessage: firstString(row, 'errorMessage', 'error_message') || null,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
  const applicationRequestIdRef = useRef(0);
  const employeeRequestIdRef = useRef(0);

  const [appCode, setAppCode] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [syncFilter, setSyncFilter] = useState<EmployeeSyncFilter>('all');
  const [userSort, setUserSort] = useState<'asc' | 'desc'>('asc');
  const [templateQuery, setTemplateQuery] = useState('');
  const [octopState, setOctopState] = useState<
    OctopAccountState | 'loading' | 'error' | undefined
  >();
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [createOptions, setCreateOptions] = useState<AgentGrantCreateOptions>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(() => emptyCreateDraft());
  const [submitting, setSubmitting] = useState(false);
  const [operation, setOperation] = useState<AgentGrantOperation>();

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
  const installedIds =
    octopState && octopState !== 'loading' && octopState !== 'error'
      ? installedTemplateIds(octopState.experts)
      : new Set<string>();

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

  const filteredTemplates = useMemo(
    () => filterPublishedTemplates(templates, templateQuery),
    [templateQuery, templates],
  );

  const resultKind = operation ? agentGrantResultKind(operation) : undefined;

  async function selectApplication(nextAppCode: string): Promise<void> {
    setAppCode(nextAppCode);
    setEmployeeId('');
    setEmployeeQuery('');
    setSyncFilter('all');
    setOctopState(undefined);
    setTemplates([]);
    setCreateOptions(undefined);
    setOperation(undefined);
    setDialogOpen(false);
    if (!nextAppCode) return;
    const current = ++applicationRequestIdRef.current;
    ++employeeRequestIdRef.current;
    try {
      const [templateResponse, optionsResponse] = await Promise.all([
        api.request<unknown>({
          path: agentGrantApplicationPath(nextAppCode, 'templates'),
        }),
        api.request<unknown>({
          path: agentGrantApplicationPath(nextAppCode, 'createOptions'),
        }),
      ]);
      if (current !== applicationRequestIdRef.current) return;
      setTemplates(readTemplates(templateResponse));
      setCreateOptions(readCreateOptions(optionsResponse));
    } catch (error) {
      if (current !== applicationRequestIdRef.current) return;
      toaster.show({
        type: 'error',
        title: errorMessage(
          error,
          t('settings.portalAgentGrantsOptionsFailed'),
        ),
      });
    }
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
    if (!selectedEmployee || !createOptions) return;
    const roleId = defaultRoleId(createOptions.roles);
    const role = createOptions.roles.find((item) => item.id === roleId);
    const next = withRoleDefaults(emptyCreateDraft(roleId), role);
    setDraft(next);
    setDialogOpen(true);
  }

  function changeRole(roleId: string): void {
    const role = createOptions?.roles.find((item) => item.id === roleId);
    setDraft((current) => withRoleDefaults({ ...current, roleId }, role));
  }

  async function submitGrant(): Promise<void> {
    if (!selectedEmployee || !appCode) return;
    const body = buildAgentGrantCreateBody({
      casdoorUserId: selectedEmployee.id,
      isNewUser,
      draft,
    });
    if (!body) {
      toaster.show({
        type: 'error',
        title: t('settings.portalAgentGrantsInvalidForm'),
      });
      return;
    }
    if (
      isNewUser &&
      createOptions &&
      !createOptions.ldapConfigured &&
      body.directory
    ) {
      toaster.show({
        type: 'error',
        title: t('settings.portalAgentGrantsLdapRequired'),
      });
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.request<unknown>({
        method: 'POST',
        path: agentGrantApplicationPath(appCode, 'grants'),
        json: body,
      });
      const created = readOperation(response);
      setOperation(created);
      setDialogOpen(false);
      setDraft(emptyCreateDraft());
      employeesQuery.reload();
      await selectEmployee(selectedEmployee.id, { keepOperation: true });
      toaster.show({
        type: 'success',
        title: isNewUser
          ? t('settings.portalAgentGrantsUserCreated')
          : t('settings.portalAgentGrantsInstallDone'),
      });
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshOperation(): Promise<void> {
    if (!operation) return;
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      {operation ? (
        <Alert className='mb-4'>
          <AlertTitle>
            {resultKind === 'COMPLETED'
              ? t('settings.portalAgentGrantsCompleted')
              : resultKind === 'PARTIAL'
                ? t('settings.portalAgentGrantsPartial')
                : resultKind === 'BOOTSTRAP_PENDING'
                  ? t('settings.portalAgentGrantsBootstrapPending')
                  : resultKind === 'OUTCOME_UNKNOWN'
                    ? t('settings.portalAgentGrantsOutcomeUnknown')
                    : t('settings.portalAgentGrantsUserCreated')}
          </AlertTitle>
          <AlertDescription>
            <div className='space-y-1 text-sm'>
              <div>
                {t('settings.portalAgentGrantsOctopUserId')}:{' '}
                {operation.octopUserId ?? '—'}
              </div>
              <div>
                {operation.completedExpertCount}/{operation.selectedExpertCount}{' '}
                {t('settings.portalAgentGrantsExpertsProgress')}
              </div>
              {operation.errorMessage ? (
                <div>{operation.errorMessage}</div>
              ) : null}
            </div>
            <div className='mt-3 flex gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => void refreshOperation()}
              >
                {t('settings.portalAgentGrantsRefreshStatus')}
              </Button>
              {resultKind === 'OUTCOME_UNKNOWN' ? (
                <Button type='button' onClick={() => void reconcileOperation()}>
                  {t('settings.portalAgentGrantsReconcile')}
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setDialogOpen(open);
          if (!open) setDraft(emptyCreateDraft());
        }}
      >
        <DialogContent className='max-h-[90vh] w-[min(100vw-2rem,56rem)] overflow-hidden sm:max-w-[56rem]'>
          <DialogHeader>
            <DialogTitle>
              {isNewUser
                ? t('settings.portalAgentGrantsCreateTitle')
                : t('settings.portalAgentGrantsInstallTitle')}
            </DialogTitle>
            <DialogDescription>
              {isNewUser
                ? t('settings.portalAgentGrantsCreateHint')
                : t('settings.portalAgentGrantsInstallHint')}
            </DialogDescription>
          </DialogHeader>

          <div className='max-h-[calc(90vh-10rem)] space-y-4 overflow-y-auto px-1 py-2'>
            {selectedEmployee ? (
              <div className='grid gap-3 md:grid-cols-3'>
                <Field
                  label={t('settings.portalAgentGrantsUsername')}
                  value={normalizeOctopIdentityField(selectedEmployee.name)}
                />
                <Field
                  label={t('settings.portalAgentGrantsDisplayName')}
                  value={selectedEmployee.displayName}
                />
                <Field
                  label={t('settings.portalAgentGrantsEmail')}
                  value={
                    normalizeOctopIdentityField(selectedEmployee.email) || '—'
                  }
                />
              </div>
            ) : null}

            {isNewUser ? (
              <>
                <div className='flex items-center justify-between rounded-md border p-3'>
                  <div>
                    <div className='text-sm font-medium'>
                      {t('settings.portalAgentGrantsDirectory')}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      {t('settings.portalAgentGrantsDirectoryHint')}
                    </div>
                  </div>
                  <Switch
                    checked={draft.directory}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        directory: checked,
                        password: checked ? '' : current.password,
                        confirmPassword: checked ? '' : current.confirmPassword,
                      }))
                    }
                  />
                </div>

                {!draft.directory ? (
                  <div className='grid gap-3 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label>{t('settings.portalAgentGrantsPassword')}</Label>
                      <Input
                        type='password'
                        value={draft.password}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>
                        {t('settings.portalAgentGrantsConfirmPassword')}
                      </Label>
                      <Input
                        type='password'
                        value={draft.confirmPassword}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            confirmPassword: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}

                <div className='space-y-2'>
                  <Label>{t('settings.portalAgentGrantsRole')}</Label>
                  <Select
                    value={draft.roleId}
                    onValueChange={(value) => {
                      const nextRoleId = String(value ?? '');
                      if (nextRoleId) changeRole(nextRoleId);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(createOptions?.roles ?? []).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='rounded-md border p-3 text-sm'>
                  <div className='font-medium'>
                    {t('settings.portalAgentGrantsBackendTypes')}
                  </div>
                  <div className='text-muted-foreground'>
                    {t('settings.portalAgentGrantsDockerSandbox')}
                  </div>
                </div>

                <PolicySwitch
                  label={t('settings.portalAgentGrantsWorkspaceRoot')}
                  enabled={draft.workspaceEnabled}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => ({
                      ...current,
                      workspaceEnabled: enabled,
                    }))
                  }
                >
                  <Input
                    value={draft.workspaceRootDir}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        workspaceRootDir: event.target.value,
                      }))
                    }
                  />
                </PolicySwitch>

                <PolicySwitch
                  label={t('settings.portalAgentGrantsTokenQuota')}
                  enabled={draft.tokenQuotaEnabled}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => ({
                      ...current,
                      tokenQuotaEnabled: enabled,
                    }))
                  }
                >
                  <Input
                    value={draft.tokenQuota}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        tokenQuota: event.target.value,
                      }))
                    }
                  />
                </PolicySwitch>

                <PolicySwitch
                  label={t('settings.portalAgentGrantsMaxAgents')}
                  enabled={draft.maxAgentsEnabled}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => ({
                      ...current,
                      maxAgentsEnabled: enabled,
                    }))
                  }
                >
                  <Input
                    value={draft.maxAgents}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxAgents: event.target.value,
                      }))
                    }
                  />
                </PolicySwitch>
              </>
            ) : (
              <Alert>
                <AlertDescription>
                  {t('settings.portalAgentGrantsAccountExists')}
                </AlertDescription>
              </Alert>
            )}

            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <Label>{t('settings.portalAgentGrantsInstallExperts')}</Label>
                <Input
                  className='w-48'
                  value={templateQuery}
                  onChange={(event) => setTemplateQuery(event.target.value)}
                  placeholder={t('settings.portalAgentGrantsSearchTemplates')}
                />
              </div>
              <div className='max-h-56 space-y-2 overflow-auto rounded-md border p-2'>
                {filteredTemplates.map((template) => {
                  const installed = installedIds.has(template.id);
                  const checked = draft.expertTemplateIds.includes(template.id);
                  return (
                    <label
                      key={template.id}
                      className='flex items-start gap-2 rounded-md border p-2'
                    >
                      <Checkbox
                        checked={checked}
                        disabled={installed}
                        onCheckedChange={(value) =>
                          setDraft((current) =>
                            toggleExpertTemplate(
                              current,
                              template.id,
                              value === true,
                              isNewUser,
                            ),
                          )
                        }
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block text-sm font-medium'>
                          {template.name}
                          {installed
                            ? ` · ${t('settings.portalAgentGrantsAlreadyInstalled')}`
                            : ''}
                        </span>
                        <span className='block text-xs text-muted-foreground'>
                          {template.id}
                          {template.updatedAt
                            ? ` · ${formatTimestamp(template.updatedAt)}`
                            : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {isNewUser ? (
              <div className='space-y-2'>
                <Label>{t('settings.portalAgentGrantsDefaultExpert')}</Label>
                <RadioGroup
                  value={draft.defaultExpertTemplateId ?? ''}
                  onValueChange={(value) => {
                    const nextId = String(value ?? '');
                    setDraft((current) => ({
                      ...current,
                      defaultExpertTemplateId: nextId || null,
                    }));
                  }}
                >
                  {draft.expertTemplateIds.map((templateId) => {
                    const template = templates.find(
                      (item) => item.id === templateId,
                    );
                    return (
                      <label
                        key={templateId}
                        className='flex items-center gap-2 rounded-md border p-2'
                      >
                        <RadioGroupItem value={templateId} />
                        <span className='text-sm'>
                          {template?.name ?? templateId}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => setDialogOpen(false)}
            >
              {t('actions.close')}
            </Button>
            <Button
              type='button'
              disabled={submitting}
              onClick={() => void submitGrant()}
            >
              {isNewUser
                ? t('settings.portalAgentGrantsSubmit')
                : t('settings.portalAgentGrantsInstallExperts')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-1 rounded-md border p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='text-sm font-medium'>{value}</div>
    </div>
  );
}

function PolicySwitch({
  label,
  enabled,
  onEnabledChange,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <Label>{label}</Label>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled ? children : null}
    </div>
  );
}
