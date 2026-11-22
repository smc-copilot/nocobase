import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
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
  expertStatusText,
  filterPublishedTemplates,
  parseOptionalNumber,
  roleDraftFields,
  selectAgentGrantApplications,
  selectableRoles,
  type AgentGrantApplication,
  type AgentGrantCreateOptions,
  type AgentGrantEmployee,
  type AgentGrantOperation,
  type InstalledExpert,
  type OctopAccountState,
  type PublishedTemplate,
} from './portal-agent-grants-model.js';

const LIST_SCROLL_CLASS =
  'h-[70vh] max-h-[70vh] overflow-auto rounded-md border p-2';

const AGENT_GRANTS = {
  resource: { type: 'settings', id: 'enterpriseAppPortal.agentGrants' },
} as const;

interface CreateDraft {
  readonly displayName: string;
  readonly email: string;
  readonly roleId: string;
  readonly permissions: readonly string[];
  readonly maxAgents: string;
  readonly tokenQuota: string;
  readonly workspaceRootDir: string;
  readonly allowedBackendTypes: readonly string[];
  readonly createDefaultExpert: boolean;
}

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
        apiBaseUrlConfigured: row.apiBaseUrlConfigured === true,
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
  const permissions = (
    Array.isArray(row.permissions) ? row.permissions : []
  ).flatMap((item) => {
    const permission = asRecord(item);
    if (!permission) return [];
    const key = firstString(permission, 'key');
    if (!key) return [];
    return [
      {
        key,
        category: firstString(permission, 'category') || 'general',
        label: firstString(permission, 'label') || key,
      },
    ];
  });
  return {
    roles: selectableRoles(roles),
    permissions,
    ldapConfigured: row.ldapConfigured === true,
    backendTypes: readStringList(
      row,
      'supportedBackendTypes',
      'supported_backend_types',
      'backendTypes',
      'backend_types',
    ),
  };
}

function readOperation(data: unknown): AgentGrantOperation | undefined {
  const body = asRecord(data);
  const row = asRecord(body?.data);
  if (!row || typeof row.id !== 'string') return undefined;
  return {
    id: row.id,
    status: typeof row.status === 'string' ? row.status : '',
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

function draftFromRole(
  employee: AgentGrantEmployee,
  options: AgentGrantCreateOptions,
  roleId: string,
  previous?: CreateDraft,
): CreateDraft {
  const role =
    options.roles.find((item) => item.id === roleId) ?? options.roles[0];
  return {
    displayName: previous?.displayName ?? employee.displayName,
    email: previous?.email ?? employee.email,
    ...roleDraftFields(role, options),
    createDefaultExpert: previous?.createDefaultExpert ?? true,
  };
}

function Choice({
  id,
  value,
  label,
  description,
  disabled = false,
}: {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <div className='flex items-start gap-2 rounded-md px-1 py-1.5'>
      <RadioGroupItem id={id} value={value} disabled={disabled} />
      <div className='grid gap-0.5'>
        <Label htmlFor={id} className='font-normal'>
          {label}
        </Label>
        {description ? (
          <p className='text-xs text-muted-foreground'>{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function AgentGrantResult({
  operation,
  busy,
  onRefresh,
  onReconcile,
}: {
  readonly operation: AgentGrantOperation;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onReconcile: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const kind = agentGrantResultKind(operation);
  const title =
    kind === 'USER_CREATED'
      ? t('settings.portalAgentGrantsUserCreated')
      : kind === 'BOOTSTRAP_PENDING'
        ? t('settings.portalAgentGrantsBootstrapPending')
        : kind === 'COMPLETED'
          ? t('settings.portalAgentGrantsCompleted')
          : kind === 'BOOTSTRAP_FAILED'
            ? t('settings.portalAgentGrantsBootstrapFailed')
            : kind === 'OUTCOME_UNKNOWN'
              ? t('settings.portalAgentGrantsOutcomeUnknown')
              : kind === 'ACCOUNT_EXISTS'
                ? t('settings.portalAgentGrantsAccountExists')
                : operation.status || t('settings.portalAgentGrantsFailed');
  return (
    <Alert
      data-testid='agent-grant-result'
      data-result-kind={kind}
      variant={
        kind === 'BOOTSTRAP_FAILED' ||
        kind === 'OUTCOME_UNKNOWN' ||
        kind === 'ACCOUNT_EXISTS'
          ? 'destructive'
          : 'default'
      }
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className='grid gap-2'>
          {kind === 'BOOTSTRAP_PENDING' ? (
            <p>{t('settings.portalAgentGrantsUserCreated')}</p>
          ) : null}
          {kind === 'OUTCOME_UNKNOWN' ? (
            <p>{t('settings.portalAgentGrantsOutcomeUnknownHint')}</p>
          ) : null}
          {operation.agentId ? (
            <p>
              {t('settings.portalAgentGrantsAgentId')}: {operation.agentId}
            </p>
          ) : null}
          {operation.publishedExpertId ? (
            <p>
              {t('settings.portalAgentGrantsPublishedExpertId')}:{' '}
              {operation.publishedExpertId}
            </p>
          ) : null}
          {operation.errorCode ? <p>{operation.errorCode}</p> : null}
          {operation.errorMessage ? <p>{operation.errorMessage}</p> : null}
          <div className='flex flex-wrap gap-2'>
            {kind === 'BOOTSTRAP_PENDING' || kind === 'USER_CREATED' ? (
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={onRefresh}
              >
                {t('settings.portalAgentGrantsRefreshStatus')}
              </Button>
            ) : null}
            {kind === 'OUTCOME_UNKNOWN' ? (
              <Button size='sm' disabled={busy} onClick={onReconcile}>
                {t('settings.portalAgentGrantsReconcile')}
              </Button>
            ) : null}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function PortalAgentGrantsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canWrite = useCan({ ...AGENT_GRANTS, action: 'configure' }).can;
  const applicationsQuery = useSettingsData<{ data: readonly unknown[] }>(
    agentGrantApplicationsPath(),
  );
  const ticketRef = useRef(0);
  const [appCode, setAppCode] = useState<string>();
  const [employees, setEmployees] = useState<readonly AgentGrantEmployee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>();
  const [templates, setTemplates] = useState<readonly PublishedTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>();
  const [templateQuery, setTemplateQuery] = useState('');
  const [octopState, setOctopState] = useState<OctopAccountState>();
  const [createOptions, setCreateOptions] = useState<AgentGrantCreateOptions>();
  const [draft, setDraft] = useState<CreateDraft>();
  const [operation, setOperation] = useState<AgentGrantOperation>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listError, setListError] = useState<unknown>();
  const [octopError, setOctopError] = useState<unknown>();
  const [optionsError, setOptionsError] = useState<unknown>();

  const applications = useMemo(
    () =>
      selectAgentGrantApplications(
        readApplications(applicationsQuery.data ?? { data: [] }),
      ),
    [applicationsQuery.data],
  );
  const selectedEmployee = employees.find((item) => item.id === employeeId);
  const visibleTemplates = useMemo(
    () => filterPublishedTemplates(templates, templateQuery),
    [templates, templateQuery],
  );
  const selectedTemplate = templates.find((item) => item.id === templateId);
  const pendingLabel = t('settings.portalAgentGrantsBootstrapPending');
  const operationBlocksCreate =
    operation !== undefined && agentGrantResultKind(operation) !== 'OTHER';
  const createDisabled =
    !canWrite ||
    !selectedEmployee ||
    selectedEmployee.isForbidden ||
    stateLoading ||
    octopError !== undefined ||
    !octopState ||
    octopState.accountExists ||
    operationBlocksCreate;

  const selectApplication = (nextAppCode: string) => {
    const ticket = ++ticketRef.current;
    setAppCode(nextAppCode);
    setEmployees([]);
    setEmployeeId(undefined);
    setTemplates([]);
    setTemplateId(undefined);
    setTemplateQuery('');
    setOctopState(undefined);
    setOctopError(undefined);
    setCreateOptions(undefined);
    setDraft(undefined);
    setOperation(undefined);
    setDrawerOpen(false);
    setListError(undefined);
    setListLoading(true);
    void (async () => {
      try {
        const [employeeResult, templateResult] = await Promise.all([
          api.request<unknown>({
            path: agentGrantApplicationPath(nextAppCode, 'employees'),
          }),
          api.request<unknown>({
            path: agentGrantApplicationPath(nextAppCode, 'templates'),
          }),
        ]);
        if (ticket !== ticketRef.current) return;
        setEmployees(readEmployees(employeeResult));
        setTemplates(readTemplates(templateResult));
      } catch (error) {
        if (ticket !== ticketRef.current) return;
        setListError(error);
      } finally {
        if (ticket === ticketRef.current) setListLoading(false);
      }
    })();
  };

  const loadOctopState = async (
    nextAppCode: string,
    employee: AgentGrantEmployee,
    ticket: number,
  ) => {
    setStateLoading(true);
    setOctopError(undefined);
    setOctopState(undefined);
    try {
      const result = await api.request<unknown>({
        path: agentGrantOctopStatePath(nextAppCode, employee.id),
      });
      if (ticket !== ticketRef.current) return;
      const state = readOctopState(result);
      if (!state) throw new Error(t('settings.portalAgentGrantsLookupFailed'));
      setOctopState(state);
    } catch (error) {
      if (ticket !== ticketRef.current) return;
      setOctopError(error);
    } finally {
      if (ticket === ticketRef.current) setStateLoading(false);
    }
  };

  const selectEmployee = (nextId: string) => {
    const employee = employees.find((item) => item.id === nextId);
    if (!employee || employee.isForbidden || !appCode) return;
    const ticket = ++ticketRef.current;
    setEmployeeId(nextId);
    setOperation(undefined);
    void loadOctopState(appCode, employee, ticket);
  };

  const openCreate = () => {
    if (createDisabled || !appCode || !selectedEmployee) return;
    const ticket = ++ticketRef.current;
    setDrawerOpen(true);
    setDraft(undefined);
    setCreateOptions(undefined);
    setOptionsError(undefined);
    setOptionsLoading(true);
    void (async () => {
      try {
        const result = await api.request<unknown>({
          path: agentGrantApplicationPath(appCode, 'createOptions'),
        });
        if (ticket !== ticketRef.current) return;
        const options = readCreateOptions(result);
        setCreateOptions(options);
        setDraft(
          draftFromRole(
            selectedEmployee,
            options,
            defaultRoleId(options.roles),
          ),
        );
      } catch (error) {
        if (ticket !== ticketRef.current) return;
        setOptionsError(error);
      } finally {
        if (ticket === ticketRef.current) setOptionsLoading(false);
      }
    })();
  };

  const applyRole = (roleId: string) => {
    if (!selectedEmployee || !createOptions) return;
    setDraft((current) =>
      draftFromRole(selectedEmployee, createOptions, roleId, current),
    );
  };

  const submitCreate = async () => {
    if (!draft || !appCode || !selectedEmployee || !createOptions) return;
    const role = createOptions.roles.find((item) => item.id === draft.roleId);
    if (!role || !createOptions.ldapConfigured) return;
    const body = buildAgentGrantCreateBody({
      casdoorUserId: selectedEmployee.id,
      displayName: draft.displayName,
      email: draft.email,
      roleId: draft.roleId,
      permissions: draft.permissions,
      maxAgents: draft.maxAgents,
      tokenQuota: draft.tokenQuota,
      workspaceRootDir: draft.workspaceRootDir,
      allowedBackendTypes: draft.allowedBackendTypes,
      createDefaultExpert: draft.createDefaultExpert,
      expertTemplateId: selectedTemplate?.id,
    });
    if (!body) return;
    setSubmitting(true);
    try {
      const result = await api.request<unknown>({
        path: agentGrantApplicationPath(appCode, 'grants'),
        method: 'POST',
        json: body,
      });
      const created = readOperation(result);
      if (!created) throw new Error(t('settings.portalAgentGrantsFailed'));
      setOperation(created);
      const ticket = ++ticketRef.current;
      await loadOctopState(appCode, selectedEmployee, ticket);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
      const ticket = ++ticketRef.current;
      await loadOctopState(appCode, selectedEmployee, ticket);
    } finally {
      setSubmitting(false);
    }
  };

  const refreshOperation = async () => {
    if (!operation) return;
    setSubmitting(true);
    try {
      const result = await api.request<unknown>({
        path: agentGrantOperationPath(operation.id),
      });
      const next = readOperation(result);
      if (next) setOperation(next);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reconcileOperation = async () => {
    if (!operation) return;
    setSubmitting(true);
    try {
      const result = await api.request<unknown>({
        path: agentGrantReconcilePath(operation.id),
        method: 'POST',
      });
      const next = readOperation(result);
      if (next) setOperation(next);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: errorMessage(error, t('settings.portalAgentGrantsFailed')),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const result = operation ? (
    <AgentGrantResult
      operation={operation}
      busy={submitting}
      onRefresh={() => void refreshOperation()}
      onReconcile={() => void reconcileOperation()}
    />
  ) : null;
  const numbersInvalid =
    draft !== undefined &&
    (parseOptionalNumber(draft.maxAgents) === undefined ||
      parseOptionalNumber(draft.tokenQuota) === undefined);
  const templateRequired =
    draft?.createDefaultExpert === true && selectedTemplate === undefined;
  const submitDisabled =
    submitting ||
    !draft ||
    !createOptions ||
    createOptions.roles.length === 0 ||
    !createOptions.ldapConfigured ||
    numbersInvalid ||
    templateRequired;

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalAgentGrants')}
        description={t('settings.portalAgentGrantsDescription')}
        actions={
          <Button disabled={createDisabled} onClick={openCreate}>
            {t('settings.portalAgentGrantsCreate')}
          </Button>
        }
      />
      {!canWrite ? (
        <Alert>
          <AlertDescription>
            {t('settings.portalAgentGrantsReadOnly')}
          </AlertDescription>
        </Alert>
      ) : null}
      {applicationsQuery.loading ? <SettingsLoading /> : null}
      {applicationsQuery.error ? (
        <SettingsError
          error={applicationsQuery.error}
          retry={() => applicationsQuery.reload()}
        />
      ) : null}
      {drawerOpen ? null : result}
      <div className='grid gap-4 lg:grid-cols-3'>
        <section
          className='grid gap-2'
          aria-label={t('settings.portalAgentGrantsApplications')}
        >
          <h2 className='text-sm font-medium'>
            {t('settings.portalAgentGrantsApplications')}
          </h2>
          <div className={LIST_SCROLL_CLASS}>
            {applications.length === 0 && !applicationsQuery.loading ? (
              <p className='text-sm text-muted-foreground'>
                {t('settings.portalAgentGrantsEmptyApplications')}
              </p>
            ) : (
              <RadioGroup
                value={appCode ?? ''}
                onValueChange={selectApplication}
              >
                {applications.map((application) => (
                  <Choice
                    key={application.appCode}
                    id={`agent-grant-app-${application.appCode}`}
                    value={application.appCode}
                    label={application.name}
                    description={application.appCode}
                  />
                ))}
              </RadioGroup>
            )}
          </div>
        </section>
        <section
          className='grid gap-2'
          aria-label={t('settings.portalAgentGrantsEmployees')}
        >
          <h2 className='text-sm font-medium'>
            {t('settings.portalAgentGrantsEmployees')}
          </h2>
          <div className={LIST_SCROLL_CLASS}>
            {!appCode ? (
              <p className='text-sm text-muted-foreground'>
                {t('settings.portalAgentGrantsSelectApplication')}
              </p>
            ) : null}
            {listLoading ? <p role='status'>{t('settings.loading')}</p> : null}
            {listError ? (
              <SettingsError
                error={listError}
                retry={() => appCode && selectApplication(appCode)}
              />
            ) : null}
            {appCode && !listLoading && employees.length === 0 && !listError ? (
              <p className='text-sm text-muted-foreground'>
                {t('settings.portalAgentGrantsSelectEmployee')}
              </p>
            ) : null}
            <RadioGroup value={employeeId ?? ''} onValueChange={selectEmployee}>
              {employees.map((employee) => (
                <Choice
                  key={employee.id}
                  id={`agent-grant-employee-${employee.id.replace(/[^A-Za-z0-9_-]/gu, '-')}`}
                  value={employee.id}
                  disabled={employee.isForbidden}
                  label={`${employee.displayName} (${employee.name})`}
                  description={
                    employee.isForbidden
                      ? t('settings.portalAgentGrantsForbidden')
                      : employee.grantSource === 'inherited'
                        ? t('settings.portalAgentGrantsGrantInherited')
                        : employee.grantSource === 'direct'
                          ? t('settings.portalAgentGrantsGrantDirect')
                          : undefined
                  }
                />
              ))}
            </RadioGroup>
            {stateLoading ? <p role='status'>{t('settings.loading')}</p> : null}
            {octopError ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('settings.portalAgentGrantsLookupFailed')}
                </AlertDescription>
              </Alert>
            ) : null}
            {octopState ? (
              <div className='mt-3 grid gap-2 text-sm'>
                <Alert
                  variant={octopState.accountExists ? 'destructive' : 'default'}
                >
                  <AlertDescription>
                    {octopState.accountExists
                      ? octopState.disabled
                        ? t('settings.portalAgentGrantsAccountDisabled')
                        : t('settings.portalAgentGrantsAccountExists')
                      : t('settings.portalAgentGrantsAccountMissing')}
                  </AlertDescription>
                </Alert>
                {octopState.octopUserId ? (
                  <p>
                    {t('settings.portalAgentGrantsOctopUserId')}:{' '}
                    <span className='font-mono'>{octopState.octopUserId}</span>
                  </p>
                ) : null}
                <h3 className='font-medium'>
                  {t('settings.portalAgentGrantsInstalledExperts')}
                </h3>
                {octopState.experts.length === 0 ? (
                  <p className='text-muted-foreground'>
                    {t('settings.portalAgentGrantsNoExperts')}
                  </p>
                ) : (
                  <ul className='grid gap-2'>
                    {octopState.experts.map((expert) => (
                      <li
                        key={`${expert.agentId}:${expert.publishedExpertId ?? ''}`}
                        className='rounded-md border p-2'
                        data-expert-status={
                          expert.bootstrapPending
                            ? 'bootstrap_pending'
                            : 'observed'
                        }
                      >
                        <p className='font-medium'>{expert.name || '—'}</p>
                        <p className='font-mono text-xs'>
                          {t('settings.portalAgentGrantsAgentId')}:{' '}
                          {expert.agentId}
                        </p>
                        <p className='font-mono text-xs'>
                          {t('settings.portalAgentGrantsPublishedExpertId')}:{' '}
                          {expert.publishedExpertId ?? '—'}
                        </p>
                        <p>
                          {t('settings.portalAgentGrantsExpertState')}:{' '}
                          <span>{expertStatusText(expert, pendingLabel)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </section>
        <section
          className='grid gap-2'
          aria-label={t('settings.portalAgentGrantsTemplates')}
        >
          <h2 className='text-sm font-medium'>
            {t('settings.portalAgentGrantsTemplates')}
          </h2>
          <div className={LIST_SCROLL_CLASS}>
            {!appCode ? (
              <p className='text-sm text-muted-foreground'>
                {t('settings.portalAgentGrantsSelectApplication')}
              </p>
            ) : (
              <Input
                value={templateQuery}
                aria-label={t('settings.portalAgentGrantsSearchTemplates')}
                placeholder={t('settings.portalAgentGrantsSearchTemplates')}
                onChange={(event) => setTemplateQuery(event.target.value)}
              />
            )}
            {appCode && !listLoading && templates.length === 0 && !listError ? (
              <p className='mt-2 text-sm text-muted-foreground'>
                {t('settings.portalAgentGrantsNoTemplates')}
              </p>
            ) : null}
            <RadioGroup
              className='mt-2'
              value={templateId ?? ''}
              onValueChange={setTemplateId}
            >
              {visibleTemplates.map((template) => (
                <Choice
                  key={template.id}
                  id={`agent-grant-template-${template.id}`}
                  value={template.id}
                  label={template.name}
                  description={[
                    `${t('settings.portalAgentGrantsTemplateId')}: ${template.id}`,
                    template.description,
                    `${t('settings.portalAgentGrantsUpdatedAt')}: ${formatTimestamp(template.updatedAt)}`,
                  ]
                    .filter((part) => part)
                    .join(' · ')}
                />
              ))}
            </RadioGroup>
            {selectedTemplate ? (
              <div className='mt-3 grid gap-1 text-xs text-muted-foreground'>
                <p>
                  {t('settings.portalAgentGrantsPublisher')}:{' '}
                  {selectedTemplate.creatorUsername ?? '—'}
                </p>
                <p>
                  {t('settings.portalAgentGrantsUpdatedAt')}:{' '}
                  {formatTimestamp(selectedTemplate.updatedAt)}
                </p>
                {selectedTemplate.description ? (
                  <p>{selectedTemplate.description}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side='right'
          className='data-[side=right]:w-full data-[side=right]:overflow-y-auto data-[side=right]:sm:max-w-xl'
        >
          <SheetHeader>
            <SheetTitle>
              {t('settings.portalAgentGrantsCreateTitle')}
            </SheetTitle>
            <SheetDescription>
              {t('settings.portalAgentGrantsDirectoryNote')}
            </SheetDescription>
          </SheetHeader>
          {optionsLoading ? <SettingsLoading /> : null}
          {optionsError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('settings.portalAgentGrantsOptionsFailed')}
              </AlertDescription>
            </Alert>
          ) : null}
          {draft && createOptions ? (
            <div className='grid gap-4 px-4'>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-username'>
                  {t('settings.portalAgentGrantsUsername')}
                </Label>
                <Input
                  id='agent-grant-username'
                  value={selectedEmployee?.name ?? ''}
                  readOnly
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-display-name'>
                  {t('settings.portalAgentGrantsDisplayName')}
                </Label>
                <Input
                  id='agent-grant-display-name'
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft({ ...draft, displayName: event.target.value })
                  }
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-email'>
                  {t('settings.portalAgentGrantsEmail')}
                </Label>
                <Input
                  id='agent-grant-email'
                  type='email'
                  value={draft.email}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                />
              </div>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='agent-grant-directory'
                  checked
                  disabled
                  aria-label={t('settings.portalAgentGrantsDirectoryLocked')}
                />
                <Label htmlFor='agent-grant-directory' className='grid gap-0.5'>
                  <span>{t('settings.portalAgentGrantsDirectoryLocked')}</span>
                  <span className='text-xs font-normal text-muted-foreground'>
                    {t('settings.portalAgentGrantsDirectoryNote')}
                  </span>
                </Label>
              </div>
              {!createOptions.ldapConfigured ? (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {t('settings.portalAgentGrantsLdapRequired')}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className='grid gap-1.5'>
                <Label>{t('settings.portalAgentGrantsRole')}</Label>
                <Select
                  items={createOptions.roles.map((role) => ({
                    value: role.id,
                    label: role.name,
                  }))}
                  value={draft.roleId}
                  onValueChange={(value) => {
                    if (typeof value === 'string') applyRole(value);
                  }}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {createOptions.roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  {t('settings.portalAgentGrantsNoAdminRole')}
                </p>
              </div>
              <fieldset className='grid gap-2'>
                <legend className='text-sm font-medium'>
                  {t('settings.portalAgentGrantsPermissions')}
                </legend>
                {createOptions.permissions.map((permission) => {
                  const checked = draft.permissions.includes(permission.key);
                  return (
                    <div
                      key={permission.key}
                      className='flex items-center gap-2'
                    >
                      <Checkbox
                        id={`agent-grant-permission-${permission.key}`}
                        checked={checked}
                        onCheckedChange={(value) => {
                          const next = new Set(draft.permissions);
                          if (value === true) next.add(permission.key);
                          else next.delete(permission.key);
                          setDraft({
                            ...draft,
                            permissions: [...next],
                          });
                        }}
                      />
                      <Label
                        htmlFor={`agent-grant-permission-${permission.key}`}
                      >
                        {permission.label}
                        <span className='ml-2 text-xs text-muted-foreground'>
                          {permission.category}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </fieldset>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-max-agents'>
                  {t('settings.portalAgentGrantsMaxAgents')}
                </Label>
                <Input
                  id='agent-grant-max-agents'
                  inputMode='numeric'
                  value={draft.maxAgents}
                  onChange={(event) =>
                    setDraft({ ...draft, maxAgents: event.target.value })
                  }
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-token-quota'>
                  {t('settings.portalAgentGrantsTokenQuota')}
                </Label>
                <Input
                  id='agent-grant-token-quota'
                  inputMode='numeric'
                  value={draft.tokenQuota}
                  onChange={(event) =>
                    setDraft({ ...draft, tokenQuota: event.target.value })
                  }
                />
                <p className='text-xs text-muted-foreground'>
                  {t('settings.portalAgentGrantsNullableHint')}
                </p>
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='agent-grant-workspace'>
                  {t('settings.portalAgentGrantsWorkspaceRoot')}
                </Label>
                <Input
                  id='agent-grant-workspace'
                  value={draft.workspaceRootDir}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      workspaceRootDir: event.target.value,
                    })
                  }
                />
              </div>
              <fieldset className='grid gap-2'>
                <legend className='text-sm font-medium'>
                  {t('settings.portalAgentGrantsBackendTypes')}
                </legend>
                {createOptions.backendTypes.map((type) => {
                  const checked = draft.allowedBackendTypes.includes(type);
                  return (
                    <div key={type} className='flex items-center gap-2'>
                      <Checkbox
                        id={`agent-grant-backend-${type}`}
                        checked={checked}
                        onCheckedChange={(value) => {
                          const next = new Set(draft.allowedBackendTypes);
                          if (value === true) next.add(type);
                          else next.delete(type);
                          setDraft({
                            ...draft,
                            allowedBackendTypes: [...next],
                          });
                        }}
                      />
                      <Label htmlFor={`agent-grant-backend-${type}`}>
                        {type}
                      </Label>
                    </div>
                  );
                })}
              </fieldset>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='agent-grant-default-expert'
                  checked={draft.createDefaultExpert}
                  onCheckedChange={(value) =>
                    setDraft({
                      ...draft,
                      createDefaultExpert: value === true,
                    })
                  }
                />
                <Label htmlFor='agent-grant-default-expert'>
                  {t('settings.portalAgentGrantsCreateDefaultExpert')}
                </Label>
              </div>
              <div className='grid gap-1 text-sm'>
                <p className='font-medium'>
                  {t('settings.portalAgentGrantsBoundTemplate')}
                </p>
                {selectedTemplate ? (
                  <p className='font-mono text-xs'>
                    {selectedTemplate.name} · {selectedTemplate.id}
                  </p>
                ) : (
                  <p className='text-muted-foreground'>
                    {t('settings.portalAgentGrantsNoBoundTemplate')}
                  </p>
                )}
              </div>
              {result}
            </div>
          ) : null}
          <SheetFooter>
            <Button
              disabled={submitDisabled}
              onClick={() => void submitCreate()}
            >
              {t('settings.portalAgentGrantsSubmit')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
