import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import React, { useEffect, useState } from 'react';

const NS = '@nocobase/app-plugin-agent-authorization';

interface GrantRow {
  readonly grantId: string;
  readonly clientId: string;
  readonly clientName?: string;
  readonly scopes: readonly string[];
  readonly status: string;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
}

/**
 * Lists the signed-in user's agent grants and lets them revoke one.
 */
export default function MyAuthorizedAppsPage(): React.JSX.Element {
  const { t } = useTranslation(NS);
  const [grants, setGrants] = useState<readonly GrantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    const response = await fetch(
      resolveAppUrl('/api/agentAuthorization/me/grants'),
      { credentials: 'include' },
    );
    const payload = (await response.json()) as {
      data?: GrantRow[];
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(
        payload.error?.message ?? t('grants.failed', 'Failed to load grants'),
      );
      return;
    }
    setGrants(payload.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(grantId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        resolveAppUrl(
          `/api/agentAuthorization/me/grants/${encodeURIComponent(grantId)}/revoke`,
        ),
        { method: 'POST', credentials: 'include' },
      );
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        setError(
          payload.error?.message ?? t('grants.revokeFailed', 'Revoke failed'),
        );
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{ maxWidth: 720, margin: '3rem auto', fontFamily: 'system-ui' }}
    >
      <h1>{t('grants.title', 'My authorized apps')}</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {grants.length === 0 ? (
        <p>{t('grants.empty', 'No authorized applications.')}</p>
      ) : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {grants.map((grant) => (
          <li
            key={grant.grantId}
            style={{
              borderBottom: '1px solid #ddd',
              padding: '12px 0',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div>
                <strong>{grant.clientName ?? grant.clientId}</strong> (
                {grant.status})
              </div>
              <div>
                {t('grants.scopes', 'Scopes')}:{' '}
                {grant.scopes.join(' ') || t('consent.none', '(none)')}
              </div>
              <div>
                {t('grants.lastUsed', 'Last used')}:{' '}
                {grant.lastUsedAt ?? t('grants.never', 'never')} ·{' '}
                {t('grants.granted', 'Granted')}: {grant.createdAt}
              </div>
            </div>
            {grant.status === 'active' ? (
              <button
                type='button'
                disabled={busy}
                onClick={() => void revoke(grant.grantId)}
              >
                {t('grants.revoke', 'Revoke')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
