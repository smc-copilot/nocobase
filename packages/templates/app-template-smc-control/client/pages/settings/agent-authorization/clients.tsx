import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Fragment, useState, type FormEvent, type ReactElement } from 'react';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Textarea } from '#components/ui/textarea';

import { SettingsModulePage } from '../settings-module-page.js';
import {
  AGENT_AUTH_METHODS,
  AGENT_SCOPES,
  useAgentList,
  type AgentAuthMethod,
  type AgentClientCreated,
  type AgentClientRow,
} from './client.js';

const LIST_LIMIT = 50;

type ListErrorCode = 'required' | 'invalid' | 'tooMany';

interface ClientDraft {
  readonly name: string;
  readonly description: string;
  readonly instanceLabel: string;
  readonly redirectUris: string;
  readonly allowedOrigins: string;
  readonly scopes: readonly string[];
  readonly authMethod: AgentAuthMethod;
}

interface EditableClientInput {
  readonly name: string;
  readonly description: string | null;
  readonly instanceLabel: string | null;
  readonly redirectUris: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly allowedScopes: readonly string[];
}

interface FieldErrorCodes {
  readonly name?: 'required';
  readonly redirectUris?: ListErrorCode;
  readonly allowedOrigins?: ListErrorCode;
}

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError && error.reason
    ? `${fallback} (${error.reason})`
    : fallback;
}

function emptyDraft(): ClientDraft {
  return {
    name: '',
    description: '',
    instanceLabel: '',
    redirectUris: '',
    allowedOrigins: '',
    scopes: ['business-ui:view'],
    authMethod: 'client_secret_post',
  };
}

function draftFromClient(client: AgentClientRow): ClientDraft {
  return {
    name: client.name,
    description: client.description ?? '',
    instanceLabel: client.instanceLabel ?? '',
    redirectUris: client.redirectUris.join('\n'),
    allowedOrigins: client.allowedOrigins.join('\n'),
    scopes: [...client.allowedScopes],
    authMethod: client.authMethod,
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//iu.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

/** One value per line, or several http(s) URLs separated by commas. */
function splitMultiValue(raw: string): string[] {
  const values = raw.split(/\r?\n/u).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const parts = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (parts.length > 1 && parts.every((part) => isAbsoluteHttpUrl(part))) {
      return parts;
    }
    return [trimmed];
  });
  return [...new Set(values)];
}

function inspectUrlList(
  raw: string,
  required: boolean,
): { readonly values: readonly string[]; readonly code?: ListErrorCode } {
  const values = splitMultiValue(raw);
  if (required && values.length === 0) return { values, code: 'required' };
  if (values.length > LIST_LIMIT) return { values, code: 'tooMany' };
  if (values.some((value) => !isAbsoluteHttpUrl(value))) {
    return { values, code: 'invalid' };
  }
  return { values };
}

function resolveDraft(draft: ClientDraft): {
  readonly input?: EditableClientInput;
  readonly errors: FieldErrorCodes;
} {
  const name = draft.name.trim();
  const redirectUris = inspectUrlList(draft.redirectUris, true);
  const allowedOrigins = inspectUrlList(draft.allowedOrigins, false);
  const errors: FieldErrorCodes = {
    ...(name ? {} : { name: 'required' as const }),
    ...(redirectUris.code ? { redirectUris: redirectUris.code } : {}),
    ...(allowedOrigins.code ? { allowedOrigins: allowedOrigins.code } : {}),
  };
  if (
    errors.name ||
    errors.redirectUris ||
    errors.allowedOrigins ||
    draft.scopes.length === 0
  ) {
    return { errors };
  }
  return {
    errors,
    input: {
      name,
      description: blankToNull(draft.description),
      instanceLabel: blankToNull(draft.instanceLabel),
      redirectUris: redirectUris.values,
      allowedOrigins: allowedOrigins.values,
      allowedScopes: draft.scopes,
    },
  };
}

function listErrorMessage(
  code: ListErrorCode | undefined,
  messages: {
    readonly required: string;
    readonly invalid: string;
    readonly tooMany: string;
  },
): string | undefined {
  if (code === 'required') return messages.required;
  if (code === 'invalid') return messages.invalid;
  if (code === 'tooMany') return messages.tooMany;
  return undefined;
}

function summarizeOrigins(
  origins: readonly string[],
  moreLabel: (count: number) => string,
): string {
  if (origins.length === 0) return '—';
  if (origins.length <= 2) return origins.join(', ');
  return `${origins[0]}, ${origins[1]} ${moreLabel(origins.length - 2)}`;
}

function ClientFields({
  idPrefix,
  draft,
  errors,
  showAuthMethod,
  onChange,
}: {
  readonly idPrefix: string;
  readonly draft: ClientDraft;
  readonly errors: FieldErrorCodes;
  readonly showAuthMethod: boolean;
  readonly onChange: (draft: ClientDraft) => void;
}): ReactElement {
  const { t } = useTranslation();
  const redirectError = listErrorMessage(errors.redirectUris, {
    required: t('agentAuthorization.redirectUrisRequired'),
    invalid: t('agentAuthorization.invalidUrls'),
    tooMany: t('agentAuthorization.tooManyEntries', { count: LIST_LIMIT }),
  });
  const originsError = listErrorMessage(errors.allowedOrigins, {
    required: t('agentAuthorization.redirectUrisRequired'),
    invalid: t('agentAuthorization.invalidUrls'),
    tooMany: t('agentAuthorization.tooManyEntries', { count: LIST_LIMIT }),
  });
  const redirectId = `${idPrefix}-redirects`;
  const originsId = `${idPrefix}-origins`;
  const authMethodItems = AGENT_AUTH_METHODS.map((method) => ({
    value: method,
    label: t(`agentAuthorization.authMethodLabel.${method}`),
  }));

  return (
    <>
      <div className='grid gap-1'>
        <Label htmlFor={`${idPrefix}-name`}>
          {t('agentAuthorization.name')}
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          required
          maxLength={255}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
        {errors.name ? (
          <p className='text-sm text-destructive'>
            {t('agentAuthorization.nameRequired')}
          </p>
        ) : null}
      </div>
      <div className='grid gap-1'>
        <Label htmlFor={`${idPrefix}-description`}>
          {t('agentAuthorization.clientDescription')}
        </Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={draft.description}
          rows={3}
          maxLength={1024}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </div>
      <div className='grid gap-1'>
        <Label htmlFor={`${idPrefix}-instance`}>
          {t('agentAuthorization.instanceLabel')}
        </Label>
        <Input
          id={`${idPrefix}-instance`}
          value={draft.instanceLabel}
          maxLength={255}
          onChange={(event) =>
            onChange({ ...draft, instanceLabel: event.target.value })
          }
        />
      </div>
      <div className='grid gap-1'>
        <Label htmlFor={redirectId}>
          {t('agentAuthorization.redirectUris')}
        </Label>
        <Textarea
          id={redirectId}
          value={draft.redirectUris}
          rows={4}
          spellCheck={false}
          aria-invalid={Boolean(redirectError)}
          aria-describedby={`${redirectId}-hint`}
          onChange={(event) =>
            onChange({ ...draft, redirectUris: event.target.value })
          }
        />
        <p id={`${redirectId}-hint`} className='text-xs text-muted-foreground'>
          {t('agentAuthorization.redirectUrisHint')}
        </p>
        {redirectError ? (
          <p className='text-sm text-destructive'>{redirectError}</p>
        ) : null}
      </div>
      <div className='grid gap-1'>
        <Label htmlFor={originsId}>
          {t('agentAuthorization.allowedOrigins')}
        </Label>
        <Textarea
          id={originsId}
          value={draft.allowedOrigins}
          rows={3}
          spellCheck={false}
          aria-invalid={Boolean(originsError)}
          aria-describedby={`${originsId}-hint`}
          onChange={(event) =>
            onChange({ ...draft, allowedOrigins: event.target.value })
          }
        />
        <p id={`${originsId}-hint`} className='text-xs text-muted-foreground'>
          {t('agentAuthorization.allowedOriginsHint')}
        </p>
        {originsError ? (
          <p className='text-sm text-destructive'>{originsError}</p>
        ) : null}
      </div>
      <fieldset className='grid gap-2'>
        <legend className='text-sm font-medium'>
          {t('agentAuthorization.scopes')}
        </legend>
        {AGENT_SCOPES.map((scope) => (
          <label key={scope} className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={draft.scopes.includes(scope)}
              onCheckedChange={(checked: boolean) => {
                onChange({
                  ...draft,
                  scopes: checked
                    ? draft.scopes.includes(scope)
                      ? draft.scopes
                      : [...draft.scopes, scope]
                    : draft.scopes.filter((item) => item !== scope),
                });
              }}
            />
            {t(`agentAuthorization.scope.${scope}`)}
          </label>
        ))}
      </fieldset>
      {showAuthMethod ? (
        <div className='grid gap-1'>
          <Label htmlFor={`${idPrefix}-auth-method`}>
            {t('agentAuthorization.authMethod')}
          </Label>
          <Select
            items={authMethodItems}
            value={draft.authMethod}
            onValueChange={(value) => {
              if (
                value === 'client_secret_post' ||
                value === 'client_secret_basic'
              ) {
                onChange({ ...draft, authMethod: value });
              }
            }}
          >
            <SelectTrigger id={`${idPrefix}-auth-method`} className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {authMethodItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </>
  );
}

function ClientEditForm({
  client,
  busy,
  onCancel,
  onSave,
}: {
  readonly client: AgentClientRow;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSave: (input: EditableClientInput) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ClientDraft>(() =>
    draftFromClient(client),
  );
  const [errors, setErrors] = useState<FieldErrorCodes>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    const resolved = resolveDraft(draft);
    setErrors(resolved.errors);
    if (!resolved.input) return;
    await onSave(resolved.input);
  }

  return (
    <form
      className='grid max-w-xl gap-3 py-2'
      onSubmit={(event) => void save(event)}
    >
      <ClientFields
        idPrefix={`agent-client-${client.clientId}`}
        draft={draft}
        errors={errors}
        showAuthMethod={false}
        onChange={setDraft}
      />
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' disabled={busy || draft.scopes.length === 0}>
          {t('agentAuthorization.save')}
        </Button>
        <Button type='button' variant='outline' onClick={onCancel}>
          {t('agentAuthorization.cancel')}
        </Button>
      </div>
    </form>
  );
}

export default function AgentClientsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useAgentList<AgentClientRow>(
    '/agentAuthorization/clients',
    reloadKey,
  );
  const [draft, setDraft] = useState<ClientDraft>(emptyDraft);
  const [errors, setErrors] = useState<FieldErrorCodes>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const failed = t('agentAuthorization.requestFailed');

  async function createClient(event: FormEvent) {
    event.preventDefault();
    const resolved = resolveDraft(draft);
    setErrors(resolved.errors);
    if (!resolved.input) return;
    setBusy(true);
    setFormError(null);
    try {
      const body = await api.request<{ data: AgentClientCreated }>({
        path: '/agentAuthorization/clients',
        method: 'POST',
        json: {
          ...resolved.input,
          authMethod: draft.authMethod,
          enabled: true,
        },
      });
      setSecret(body.data.clientSecret);
      setDraft((current) => ({
        ...emptyDraft(),
        scopes: current.scopes,
      }));
      setErrors({});
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setFormError(failureMessage(caught, failed));
    } finally {
      setBusy(false);
    }
  }

  async function patch(
    clientId: string,
    json: { readonly enabled: boolean } | EditableClientInput | undefined,
    pathSuffix = '',
  ): Promise<boolean> {
    setBusy(true);
    setFormError(null);
    try {
      const body = await api.request<{
        data: AgentClientRow & { readonly clientSecret?: string };
      }>({
        path: `/agentAuthorization/clients/${encodeURIComponent(clientId)}${pathSuffix}`,
        method: pathSuffix ? 'POST' : 'PATCH',
        json,
      });
      if (body.data.clientSecret) setSecret(body.data.clientSecret);
      setReloadKey((value) => value + 1);
      return true;
    } catch (caught) {
      setFormError(failureMessage(caught, failed));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // authMethod and the client secret are intentionally omitted. Changing
  // authMethod stays API-only; rotate the secret with the row action.
  async function saveClient(clientId: string, input: EditableClientInput) {
    const saved = await patch(clientId, input);
    if (saved) setEditingId(null);
  }

  return (
    <SettingsModulePage
      title={t('agentAuthorization.clients')}
      description={t('agentAuthorization.clientsDescription')}
    >
      <form
        className='grid max-w-xl gap-3'
        onSubmit={(event) => void createClient(event)}
      >
        <ClientFields
          idPrefix='agent-client'
          draft={draft}
          errors={errors}
          showAuthMethod
          onChange={setDraft}
        />
        <Button type='submit' disabled={busy || draft.scopes.length === 0}>
          {t('agentAuthorization.create')}
        </Button>
      </form>
      {secret ? (
        <p className='rounded-lg border bg-muted p-3 text-sm break-all'>
          {t('agentAuthorization.secretOnce')}
          <br />
          <code>{secret}</code>
        </p>
      ) : null}
      {formError || error ? (
        <p className='text-sm text-destructive'>{formError ?? error}</p>
      ) : null}
      {data && data.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('agentAuthorization.empty')}
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('agentAuthorization.name')}</TableHead>
              <TableHead>{t('agentAuthorization.clientId')}</TableHead>
              <TableHead>{t('agentAuthorization.instanceLabel')}</TableHead>
              <TableHead>{t('agentAuthorization.authMethod')}</TableHead>
              <TableHead>{t('agentAuthorization.origins')}</TableHead>
              <TableHead>{t('agentAuthorization.scopes')}</TableHead>
              <TableHead>{t('agentAuthorization.status')}</TableHead>
              <TableHead>{t('agentAuthorization.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((client) => (
              <Fragment key={client.clientId}>
                <TableRow>
                  <TableCell className='whitespace-normal'>
                    <div className='font-medium'>{client.name}</div>
                    {client.description ? (
                      <div className='line-clamp-2 text-muted-foreground'>
                        {client.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className='font-mono text-xs break-all whitespace-normal'>
                    {client.clientId}
                  </TableCell>
                  <TableCell>{client.instanceLabel ?? '—'}</TableCell>
                  <TableCell title={client.authMethod}>
                    {t(
                      `agentAuthorization.authMethodLabel.${client.authMethod}`,
                    )}
                  </TableCell>
                  <TableCell
                    className='max-w-xs text-xs break-all whitespace-normal'
                    title={client.allowedOrigins.join(', ')}
                  >
                    {summarizeOrigins(client.allowedOrigins, (count) =>
                      t('agentAuthorization.originsMore', { count }),
                    )}
                  </TableCell>
                  <TableCell className='text-xs'>
                    {client.allowedScopes.join(', ')}
                  </TableCell>
                  <TableCell>
                    {client.enabled
                      ? t('agentAuthorization.enabled')
                      : t('agentAuthorization.disabled')}
                  </TableCell>
                  <TableCell className='whitespace-normal'>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={busy}
                        aria-expanded={editingId === client.clientId}
                        onClick={() =>
                          setEditingId((current) =>
                            current === client.clientId
                              ? null
                              : client.clientId,
                          )
                        }
                      >
                        {t('agentAuthorization.edit')}
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            client.clientId,
                            undefined,
                            '/rotateSecret',
                          )
                        }
                      >
                        {t('agentAuthorization.rotate')}
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={busy}
                        onClick={() =>
                          void patch(client.clientId, {
                            enabled: !client.enabled,
                          })
                        }
                      >
                        {client.enabled
                          ? t('agentAuthorization.disable')
                          : t('agentAuthorization.enable')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === client.clientId ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className='bg-muted/40 align-top whitespace-normal'
                    >
                      <ClientEditForm
                        client={client}
                        busy={busy}
                        onCancel={() => setEditingId(null)}
                        onSave={(input) => saveClient(client.clientId, input)}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </SettingsModulePage>
  );
}
