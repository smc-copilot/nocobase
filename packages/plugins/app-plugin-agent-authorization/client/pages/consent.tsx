import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import React, { useMemo, useState, type FormEvent } from 'react';

const NS = '@nocobase/app-plugin-agent-authorization';

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

  const clientLabel = clientId || t('consent.unknownClient', 'Unknown client');

  return (
    <main
      style={{ maxWidth: 480, margin: '3rem auto', fontFamily: 'system-ui' }}
    >
      <h1>{t('consent.title', 'Authorize application')}</h1>
      <p>
        {t('consent.requesting', {
          clientId: clientLabel,
          defaultValue: '{{clientId}} requests access.',
        })}
      </p>
      <dl>
        <dt>{t('consent.scopes', 'Scopes')}</dt>
        <dd>{scope || t('consent.none', '(none)')}</dd>
        <dt>{t('consent.redirect', 'Redirect')}</dt>
        <dd style={{ wordBreak: 'break-all' }}>{redirectUri}</dd>
      </dl>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onApprove} style={{ display: 'flex', gap: 12 }}>
        <button type='submit' disabled={busy || !clientId}>
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
