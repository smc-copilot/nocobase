import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import React, { useEffect, useMemo, useState, type FormEvent } from 'react';

const NS = '@nocobase/app-plugin-agent-authorization';

interface ConsentContext {
  readonly name: string;
  readonly instanceLabel: string | null;
  readonly audience: string;
  readonly requestedScopes: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly redirectUri: string | null;
  readonly enabled: boolean;
  readonly grant: {
    readonly expiresAt: string | null;
  } | null;
}

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  'business-ui:view': 'View business UI',
  'business-ui:edit': 'Edit business UI',
};

/**
 * Minimal consent page for the authorization-code + PKCE flow.
 * Approve and Deny post to the consent API and follow its redirect.
 */
export default function AgentConsentPage(): React.JSX.Element {
  const { t } = useTranslation(NS);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const scope = params.get('scope') ?? '';
  const state = params.get('state') ?? '';
  const codeChallenge = params.get('code_challenge') ?? '';
  const [meta, setMeta] = useState<ConsentContext | null>(null);
  const [metaError, setMetaError] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ client_id: clientId });
    if (scope) query.set('scope', scope);
    if (redirectUri) query.set('redirect_uri', redirectUri);
    void fetch(
      resolveAppUrl(
        `/api/agentAuthorization/oauth/consent-context?${query.toString()}`,
      ),
      {
        credentials: 'include',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: ConsentContext;
        };
        if (!response.ok || !payload.data) {
          setMetaError(true);
          return;
        }
        setMeta(payload.data);
        setMetaError(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return;
        }
        setMetaError(true);
      });
    return () => controller.abort();
  }, [clientId, redirectUri, scope]);

  async function decide(decision: 'approve' | 'deny') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        resolveAppUrl('/api/agentAuthorization/oauth/consent'),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            redirect_uri: redirectUri,
            ...(state ? { state } : {}),
            code_challenge: codeChallenge,
            scope,
            decision,
          }),
        },
      );
      const location = response.headers.get('Location');
      if (
        location &&
        (response.status === 302 ||
          response.status === 303 ||
          response.type === 'opaqueredirect')
      ) {
        window.location.assign(location);
        return;
      }
      const payload = (await response.json()) as {
        data?: { redirectUri?: string };
        redirectUri?: string;
        error?: { message?: string };
      };
      const next = payload.data?.redirectUri ?? payload.redirectUri;
      if (!response.ok || !next) {
        setError(
          payload.error?.message ?? t('consent.failed', 'Consent failed'),
        );
        setBusy(false);
        return;
      }
      window.location.assign(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('consent.failed', 'Consent failed'),
      );
      setBusy(false);
    }
  }

  function onApprove(event: FormEvent) {
    event.preventDefault();
    void decide('approve');
  }

  const appName =
    meta?.name ??
    (metaError
      ? t('consent.unknownClient', 'Unknown client')
      : t('consent.loading', 'Loading application…'));
  const requested =
    meta?.requestedScopes ?? scope.split(/\s+/u).filter(Boolean);
  const shownRedirect = meta?.redirectUri ?? (meta ? null : redirectUri);
  const expiry = meta?.grant
    ? (meta.grant.expiresAt ?? t('consent.noExpiry', 'No expiry'))
    : t('consent.newGrant', 'A new authorization will be created');

  return (
    <main
      style={{ maxWidth: 480, margin: '3rem auto', fontFamily: 'system-ui' }}
    >
      <h1>{t('consent.title', 'Authorize application')}</h1>
      <p>
        {t('consent.requesting', {
          clientId: appName,
          defaultValue: '{{clientId}} requests access.',
        })}
      </p>
      {metaError ? (
        <p>
          {t('consent.metadataFailed', 'Could not load application details.')}
        </p>
      ) : null}
      <dl>
        <dt>{t('consent.application', 'Application')}</dt>
        <dd>{appName}</dd>
        {meta?.instanceLabel ? (
          <>
            <dt>{t('consent.instance', 'Instance')}</dt>
            <dd>{meta.instanceLabel}</dd>
          </>
        ) : null}
        <dt>{t('consent.audience', 'Audience')}</dt>
        <dd>
          {meta?.audience ?? t('consent.loading', 'Loading application…')}
        </dd>
        <dt>{t('consent.scopes', 'Scopes')}</dt>
        <dd>
          {requested.length === 0
            ? t('consent.none', '(none)')
            : requested
                .map((item) =>
                  t(`consent.scope.${item}`, SCOPE_LABELS[item] ?? item),
                )
                .join(', ')}
        </dd>
        <dt>{t('consent.redirect', 'Redirect')}</dt>
        <dd style={{ wordBreak: 'break-all' }}>
          {shownRedirect ??
            t('consent.redirectUnregistered', 'Redirect is not registered')}
        </dd>
        <dt>{t('consent.expires', 'Authorization expiry')}</dt>
        <dd>{meta ? expiry : t('consent.loading', 'Loading application…')}</dd>
      </dl>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onApprove} style={{ display: 'flex', gap: 12 }}>
        <button
          type='submit'
          disabled={busy || !clientId || meta?.enabled === false}
        >
          {t('consent.approve', 'Approve')}
        </button>
        <button
          type='button'
          disabled={busy || !clientId}
          onClick={() => void decide('deny')}
        >
          {t('consent.deny', 'Deny')}
        </button>
      </form>
    </main>
  );
}
