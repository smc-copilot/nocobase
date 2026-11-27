import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
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
  agentGrantApplicationPath,
  buildAgentGrantCreateBody,
  defaultRoleId,
  emptyCreateDraft,
  filterPublishedTemplates,
  installedTemplateIds,
  normalizeOctopIdentityField,
  toggleExpertTemplate,
  withRoleDefaults,
  type AgentGrantCreateOptions,
  type AgentGrantOperation,
  type CreateDraft,
  type InstalledExpert,
  type PublishedTemplate,
} from './portal-agent-grants-model.js';
import {
  formatTimestamp,
  readCreateOptions,
  readOperation,
  readTemplates,
} from './portal-agent-grants-parsers.js';

/** RadioGroup sentinel for an unset optional default expert. */
const DEFAULT_EXPERT_NONE = '__none__';
const EMPTY_TEMPLATES: readonly PublishedTemplate[] = [];

export interface AgentGrantInstallTarget {
  /** Casdoor user id (`owner/name`). */
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  readonly accountExists: boolean;
  readonly experts: readonly InstalledExpert[];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Create-user or install-experts dialog shared by Agent Grants and Agent user
 * management. Templates and create options load for `appCode` when the dialog
 * opens, and are prefetched once `appCode` is known so the form can paint
 * immediately.
 */
export function PortalAgentGrantInstallDialog({
  open,
  onOpenChange,
  appCode,
  employee,
  onCompleted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly appCode: string;
  readonly employee: AgentGrantInstallTarget;
  readonly onCompleted: (operation: AgentGrantOperation) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [loaded, setLoaded] = useState<
    | {
        readonly appCode: string;
        readonly templates: readonly PublishedTemplate[];
        readonly createOptions: AgentGrantCreateOptions;
      }
    | undefined
  >();
  const [templateQuery, setTemplateQuery] = useState('');
  const [draft, setDraft] = useState<CreateDraft>(() => emptyCreateDraft());
  const [submitting, setSubmitting] = useState(false);

  const templates =
    loaded?.appCode === appCode ? loaded.templates : EMPTY_TEMPLATES;
  const createOptions =
    loaded?.appCode === appCode ? loaded.createOptions : undefined;
  const isNewUser = !employee.accountExists;
  const installedIds = installedTemplateIds(employee.experts);
  const filteredTemplates = useMemo(
    () => filterPublishedTemplates(templates, templateQuery),
    [templateQuery, templates],
  );

  useEffect(() => {
    if (!appCode) return;
    let cancelled = false;
    const requested = appCode;
    const initDraft = open;
    void (async () => {
      try {
        const [templateResponse, optionsResponse] = await Promise.all([
          api.request<unknown>({
            path: agentGrantApplicationPath(requested, 'templates'),
          }),
          api.request<unknown>({
            path: agentGrantApplicationPath(requested, 'createOptions'),
          }),
        ]);
        if (cancelled) return;
        const nextOptions = readCreateOptions(optionsResponse);
        setLoaded({
          appCode: requested,
          templates: readTemplates(templateResponse),
          createOptions: nextOptions,
        });
        if (!initDraft) return;
        const roleId = defaultRoleId(nextOptions.roles);
        const role = nextOptions.roles.find((item) => item.id === roleId);
        setTemplateQuery('');
        setDraft(withRoleDefaults(emptyCreateDraft(roleId), role));
      } catch (error) {
        if (cancelled) return;
        toaster.show({
          type: 'error',
          title: errorMessage(
            error,
            t('settings.portalAgentGrantsOptionsFailed'),
          ),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, appCode, open, t, toaster]);

  function changeRole(roleId: string): void {
    const role = createOptions?.roles.find((item) => item.id === roleId);
    setDraft((current) => withRoleDefaults({ ...current, roleId }, role));
  }

  async function submitGrant(): Promise<void> {
    if (!employee.id || !appCode) return;
    const body = buildAgentGrantCreateBody({
      casdoorUserId: employee.id,
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
      onOpenChange(false);
      if (created) onCompleted(created);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
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
          {employee.id ? (
            <div className='grid gap-3 md:grid-cols-3'>
              <Field
                label={t('settings.portalAgentGrantsUsername')}
                value={normalizeOctopIdentityField(employee.name)}
              />
              <Field
                label={t('settings.portalAgentGrantsDisplayName')}
                value={employee.displayName}
              />
              <Field
                label={t('settings.portalAgentGrantsEmail')}
                value={normalizeOctopIdentityField(employee.email) || '—'}
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
              <p className='text-xs text-muted-foreground'>
                {t('settings.portalAgentGrantsDefaultExpertOptional')}
              </p>
              <RadioGroup
                value={draft.defaultExpertTemplateId ?? DEFAULT_EXPERT_NONE}
                onValueChange={(value) => {
                  const nextId = String(value ?? '');
                  setDraft((current) => ({
                    ...current,
                    defaultExpertTemplateId:
                      !nextId || nextId === DEFAULT_EXPERT_NONE ? null : nextId,
                  }));
                }}
              >
                <label className='flex items-center gap-2 rounded-md border p-2'>
                  <RadioGroupItem value={DEFAULT_EXPERT_NONE} />
                  <span className='text-sm'>
                    {t('settings.portalAgentGrantsDefaultExpertNone')}
                  </span>
                </label>
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
            onClick={() => onOpenChange(false)}
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
