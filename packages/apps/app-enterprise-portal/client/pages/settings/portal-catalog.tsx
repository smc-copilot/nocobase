import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
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
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
import { SettingsError, SettingsLoading } from './shared.js';
import { useSettingsData } from './hooks.js';
import { agentGrantApplicationPath } from './portal-agent-grants-model.js';

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
  readonly agentGrantsEnabled?: boolean;
  readonly supportsInstallAsUser?: boolean;
  readonly apiBaseUrl?: string | null;
  readonly apiAuthMode?: string | null;
  readonly apiTokenEnv?: string | null;
  readonly apiUsernameEnv?: string | null;
  readonly apiPasswordEnv?: string | null;
}

type AgentAuthMode = 'bearer_env' | 'password_login_env';

interface AgentGrantDraft {
  readonly agentGrantsEnabled?: boolean;
  readonly supportsInstallAsUser?: boolean;
  readonly apiBaseUrl?: string;
  readonly apiAuthMode?: AgentAuthMode;
  readonly apiTokenEnv?: string;
  readonly apiUsernameEnv?: string;
  readonly apiPasswordEnv?: string;
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

function asAuthMode(value: string | null | undefined): AgentAuthMode {
  return value === 'password_login_env' ? 'password_login_env' : 'bearer_env';
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Management API origin only; strip a trailing `/api` that would become `/api/api/...`. */
function normalizeApiBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/+$/u, '')
    .replace(/\/api$/iu, '');
}

function isEnvVarName(value: string): boolean {
  return ENV_NAME.test(value.trim());
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
  const canConfigureAgentGrants = useCan({
    resource: { type: 'settings', id: 'enterpriseAppPortal.agentGrants' },
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
  const [agentDrafts, setAgentDrafts] = useState<
    Record<string, AgentGrantDraft>
  >({});
  const [configRowKey, setConfigRowKey] = useState<string>();

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

  const configRow = useMemo(
    () => rows.find((row) => row.casdoor.name === configRowKey),
    [configRowKey, rows],
  );

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
    setAgentDrafts({});
    casdoorList.reload();
    localList.reload();
  };

  const agentEnabled = (row: MergedRow): boolean => {
    const draft = agentDrafts[row.casdoor.name];
    if (draft?.agentGrantsEnabled !== undefined)
      return draft.agentGrantsEnabled;
    return row.local?.agentGrantsEnabled === true;
  };

  const agentSupportsInstallAsUser = (row: MergedRow): boolean => {
    const draft = agentDrafts[row.casdoor.name];
    if (draft?.supportsInstallAsUser !== undefined) {
      return draft.supportsInstallAsUser;
    }
    return row.local?.supportsInstallAsUser === true;
  };

  const agentText = (
    row: MergedRow,
    field: 'apiBaseUrl' | 'apiTokenEnv' | 'apiUsernameEnv' | 'apiPasswordEnv',
  ): string => {
    const draft = agentDrafts[row.casdoor.name];
    const drafted = draft?.[field];
    if (drafted !== undefined) return drafted;
    return row.local?.[field] ?? '';
  };

  const agentMode = (row: MergedRow): AgentAuthMode => {
    const draft = agentDrafts[row.casdoor.name]?.apiAuthMode;
    if (draft) return draft;
    return asAuthMode(row.local?.apiAuthMode);
  };

  const setAgentDraft = (key: string, patch: AgentGrantDraft) => {
    setAgentDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  };

  const validateAgentGrantDraft = (
    row: MergedRow,
  ):
    | {
        readonly enabled: boolean;
        readonly supportsInstallAsUser: boolean;
        readonly apiBaseUrl: string;
        readonly apiAuthMode: AgentAuthMode;
        readonly apiTokenEnv: string | null;
        readonly apiUsernameEnv: string | null;
        readonly apiPasswordEnv: string | null;
      }
    | undefined => {
    const enabled = agentEnabled(row);
    const supportsInstallAsUser = agentSupportsInstallAsUser(row);
    const apiBaseUrl = normalizeApiBaseUrl(agentText(row, 'apiBaseUrl'));
    const apiAuthMode = agentMode(row);
    const apiTokenEnv = emptyToNull(agentText(row, 'apiTokenEnv'));
    const apiUsernameEnv = emptyToNull(agentText(row, 'apiUsernameEnv'));
    const apiPasswordEnv = emptyToNull(agentText(row, 'apiPasswordEnv'));
    if (enabled && !isLikelyUrl(apiBaseUrl)) {
      toaster.show({
        type: 'error',
        title: t('settings.portalAgentGrantsNeedApiUrl'),
      });
      return undefined;
    }
    if (enabled && apiAuthMode === 'bearer_env') {
      if (!apiTokenEnv || !isEnvVarName(apiTokenEnv)) {
        toaster.show({
          type: 'error',
          title: t('settings.portalAgentGrantsNeedEnvName'),
        });
        return undefined;
      }
    }
    if (enabled && apiAuthMode === 'password_login_env') {
      if (
        !apiUsernameEnv ||
        !apiPasswordEnv ||
        !isEnvVarName(apiUsernameEnv) ||
        !isEnvVarName(apiPasswordEnv)
      ) {
        toaster.show({
          type: 'error',
          title: t('settings.portalAgentGrantsNeedEnvName'),
        });
        return undefined;
      }
    }
    return {
      enabled,
      supportsInstallAsUser,
      apiBaseUrl,
      apiAuthMode,
      apiTokenEnv,
      apiUsernameEnv,
      apiPasswordEnv,
    };
  };

  const saveAgentGrants = async (row: MergedRow): Promise<boolean> => {
    if (!canConfigureAgentGrants || !row.local || row.local.appType !== 'octop')
      return false;
    const payload = validateAgentGrantDraft(row);
    if (!payload) return false;
    setBusyKey(row.casdoor.name);
    try {
      await api.request({
        path: agentGrantApplicationPath(row.local.appCode, 'instanceConfig'),
        method: 'PUT',
        json: {
          agentGrantsEnabled: payload.enabled,
          supportsInstallAsUser: payload.supportsInstallAsUser,
          apiBaseUrl: emptyToNull(payload.apiBaseUrl),
          apiAuthMode: payload.apiAuthMode,
          apiTokenEnv: payload.apiTokenEnv,
          apiUsernameEnv: payload.apiUsernameEnv,
          apiPasswordEnv: payload.apiPasswordEnv,
        },
      });
      toaster.show({
        type: 'success',
        title: t('settings.portalAgentGrantsConfigSaved'),
      });
      // Keep the drawer open; only refresh local lists and clear drafts for this key.
      setAgentDrafts((current) => {
        const next = { ...current };
        delete next[row.casdoor.name];
        return next;
      });
      localList.reload();
      return true;
    } catch (saveError) {
      toaster.show({
        type: 'error',
        title: errorMessage(
          saveError,
          t('settings.portalAgentGrantsConfigFailed'),
        ),
      });
      return false;
    } finally {
      setBusyKey(undefined);
    }
  };

  const testAgentConnection = async (row: MergedRow) => {
    if (!canConfigureAgentGrants || !row.local) return;
    // testConnection reads the saved catalog row. Persist the drawer draft first.
    if (!agentEnabled(row)) {
      toaster.show({
        type: 'error',
        title: t('settings.portalAgentGrantsSaveBeforeTest'),
      });
      return;
    }
    const saved = await saveAgentGrants(row);
    if (!saved) return;
    setBusyKey(row.casdoor.name);
    try {
      await api.request({
        path: agentGrantApplicationPath(row.local.appCode, 'testConnection'),
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t('settings.portalAgentGrantsConnectionOk'),
      });
    } catch (testError) {
      toaster.show({
        type: 'error',
        title: errorMessage(
          testError,
          t('settings.portalAgentGrantsConnectionFailed'),
        ),
      });
    } finally {
      setBusyKey(undefined);
    }
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

  const statusLabel = (row: MergedRow): string => {
    if (!row.local) return t('portal.notInPortal');
    const enabled = row.local.enabled
      ? t('settings.enabled')
      : t('settings.disabled');
    return `${t('portal.imported')} | ${enabled}`;
  };

  const drawerBusy = configRow ? busyKey === configRow.casdoor.name : false;
  const drawerIsOctop = configRow?.local?.appType === 'octop';
  const drawerMode = configRow ? agentMode(configRow) : 'bearer_env';

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
                    ) : null}
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
                  <td className='p-3 whitespace-nowrap'>{statusLabel(row)}</td>
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
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={busy}
                            onClick={() => setConfigRowKey(key)}
                          >
                            {t('portal.configure')}
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

      <Sheet
        open={configRow !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfigRowKey(undefined);
        }}
      >
        <SheetContent
          side='right'
          className='data-[side=right]:w-full data-[side=right]:overflow-y-auto data-[side=right]:sm:max-w-xl'
        >
          {configRow?.local ? (
            <>
              <SheetHeader>
                <SheetTitle>{t('portal.configureDrawerTitle')}</SheetTitle>
                <SheetDescription>
                  {configRow.local.name} · {configRow.local.appCode}
                </SheetDescription>
              </SheetHeader>
              <div className='grid gap-4 px-4 pb-6'>
                <div className='grid gap-1 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('portal.casdoorAppKey')}:{' '}
                    </span>
                    <span className='font-mono'>{configRow.casdoor.name}</span>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('settings.status')}:{' '}
                    </span>
                    {statusLabel(configRow)}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('portal.appType')}:{' '}
                    </span>
                    {configRow.local.appType}
                  </div>
                </div>

                {drawerIsOctop ? (
                  <div className='grid gap-3 rounded-lg border p-4'>
                    <p className='text-sm font-medium'>
                      {t('settings.portalAgentGrants')}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('settings.portalAgentGrantsEnvNameHint')}
                    </p>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        id='agent-grants-drawer'
                        checked={agentEnabled(configRow)}
                        disabled={!canConfigureAgentGrants || drawerBusy}
                        onCheckedChange={(checked) =>
                          setAgentDraft(configRow.casdoor.name, {
                            agentGrantsEnabled: checked === true,
                          })
                        }
                      />
                      <Label htmlFor='agent-grants-drawer'>
                        {t('settings.portalAgentGrantsEnabled')}
                      </Label>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        id='agent-grants-as-user-drawer'
                        checked={agentSupportsInstallAsUser(configRow)}
                        disabled={
                          !canConfigureAgentGrants ||
                          drawerBusy ||
                          !agentEnabled(configRow)
                        }
                        onCheckedChange={(checked) =>
                          setAgentDraft(configRow.casdoor.name, {
                            supportsInstallAsUser: checked === true,
                          })
                        }
                      />
                      <Label htmlFor='agent-grants-as-user-drawer'>
                        {t('settings.portalAgentGrantsSupportsInstallAsUser')}
                      </Label>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                      {t('settings.portalAgentGrantsSupportsInstallAsUserHint')}
                    </p>
                    <div className='grid gap-3'>
                      <div className='grid gap-1.5'>
                        <Label htmlFor='agent-api-drawer'>
                          {t('settings.portalAgentGrantsApiBaseUrl')}
                        </Label>
                        <Input
                          id='agent-api-drawer'
                          value={agentText(configRow, 'apiBaseUrl')}
                          disabled={!canConfigureAgentGrants || drawerBusy}
                          onChange={(event) =>
                            setAgentDraft(configRow.casdoor.name, {
                              apiBaseUrl: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className='grid gap-1.5'>
                        <Label>
                          {t('settings.portalAgentGrantsApiAuthMode')}
                        </Label>
                        <Select
                          items={[
                            {
                              value: 'bearer_env',
                              label: t('settings.portalAgentGrantsBearerEnv'),
                            },
                            {
                              value: 'password_login_env',
                              label: t(
                                'settings.portalAgentGrantsPasswordLoginEnv',
                              ),
                            },
                          ]}
                          value={drawerMode}
                          onValueChange={(value) => {
                            if (
                              value === 'bearer_env' ||
                              value === 'password_login_env'
                            ) {
                              setAgentDraft(configRow.casdoor.name, {
                                apiAuthMode: value,
                              });
                            }
                          }}
                        >
                          <SelectTrigger
                            className='w-full'
                            disabled={!canConfigureAgentGrants || drawerBusy}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='bearer_env'>
                              {t('settings.portalAgentGrantsBearerEnv')}
                            </SelectItem>
                            <SelectItem value='password_login_env'>
                              {t('settings.portalAgentGrantsPasswordLoginEnv')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='grid gap-1.5'>
                        <Label htmlFor='agent-token-env-drawer'>
                          {t('settings.portalAgentGrantsApiTokenEnv')}
                        </Label>
                        <Input
                          id='agent-token-env-drawer'
                          autoComplete='off'
                          value={agentText(configRow, 'apiTokenEnv')}
                          disabled={!canConfigureAgentGrants || drawerBusy}
                          onChange={(event) =>
                            setAgentDraft(configRow.casdoor.name, {
                              apiTokenEnv: event.target.value,
                            })
                          }
                        />
                      </div>
                      {drawerMode === 'password_login_env' ? (
                        <>
                          <div className='grid gap-1.5'>
                            <Label htmlFor='agent-user-env-drawer'>
                              {t('settings.portalAgentGrantsApiUsernameEnv')}
                            </Label>
                            <Input
                              id='agent-user-env-drawer'
                              autoComplete='off'
                              value={agentText(configRow, 'apiUsernameEnv')}
                              disabled={!canConfigureAgentGrants || drawerBusy}
                              onChange={(event) =>
                                setAgentDraft(configRow.casdoor.name, {
                                  apiUsernameEnv: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className='grid gap-1.5'>
                            <Label htmlFor='agent-password-env-drawer'>
                              {t('settings.portalAgentGrantsApiPasswordEnv')}
                            </Label>
                            <Input
                              id='agent-password-env-drawer'
                              autoComplete='off'
                              value={agentText(configRow, 'apiPasswordEnv')}
                              disabled={!canConfigureAgentGrants || drawerBusy}
                              onChange={(event) =>
                                setAgentDraft(configRow.casdoor.name, {
                                  apiPasswordEnv: event.target.value,
                                })
                              }
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        disabled={!canConfigureAgentGrants || drawerBusy}
                        onClick={() => void saveAgentGrants(configRow)}
                      >
                        {t('settings.save')}
                      </Button>
                      <Button
                        variant='outline'
                        disabled={!canConfigureAgentGrants || drawerBusy}
                        onClick={() => void testAgentConnection(configRow)}
                      >
                        {t('settings.portalAgentGrantsTestConnection')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      {t('portal.agentGrantsOnlyOctop')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
