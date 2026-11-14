import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect } from 'react';

const NS = '@nocobase/app-plugin-agent-authorization';

/**
 * SPA recovery step after native login. AuthenticationGuard navigates here inside
 * the router; this page then leaves the SPA so the authorize API can redirect.
 */
export default function AuthorizeRecoveryPage(): React.JSX.Element {
  const { t } = useTranslation(NS);

  useEffect(() => {
    window.location.replace(
      resolveAppUrl(
        `/api/agentAuthorization/oauth/authorize${window.location.search}`,
      ),
    );
  }, []);

  return (
    <main
      style={{ maxWidth: 480, margin: '3rem auto', fontFamily: 'system-ui' }}
    >
      <p>{t('authorize.continuing', 'Continuing authorization…')}</p>
    </main>
  );
}
