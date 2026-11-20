import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SettingsError } from './shared.js';

const STATE_KEY = 'meeting-gateway-oauth-state';

/**
 * Gateway connection address and bridge secrets are configured via
 * packages/apps/app-meeting/.env only. This route remains for OAuth callback
 * completion; operators bind from the Meetings list.
 */
export default function MeetingConnectionsPage(): ReactElement {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate('/meetings', { replace: true });
  }, [navigate]);
  return <PageContainer />;
}

export function MeetingGatewayCallbackPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const state = sessionStorage.getItem(STATE_KEY) || params.get('localState');
    if (!state) {
      void navigate('/meetings', { replace: true });
      return;
    }
    void api
      .request({
        path: 'meetingGateway/bindings/complete',
        method: 'POST',
        json: { state },
      })
      .then(() => {
        sessionStorage.removeItem(STATE_KEY);
        void navigate('/meetings', { replace: true });
      })
      .catch((next: unknown) => {
        setError(next);
      });
  }, [api, navigate, params]);

  return (
    <PageContainer>
      <PageHeader title={t('meetingConnections.completing')} />
      <SettingsError error={error} />
    </PageContainer>
  );
}
