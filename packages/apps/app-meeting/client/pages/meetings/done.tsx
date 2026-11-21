import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';

const STATE_KEY = 'meeting-gateway-oauth-state';

const CALLBACK_SECRET_PARAMS = [
  'access_token',
  'token_type',
  'expires_in',
  'connection_id',
  'member_id',
  'status',
  'session_token',
  'session_expires_in',
] as const;

function stripCallbackSecretsFromUrl(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of CALLBACK_SECRET_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

/**
 * Gateway continue_to lands here. Sensitive callback query fields are stripped
 * from the address bar immediately and forwarded once to NocoBase so the
 * server can seal the bridge. The page never keeps mt_ tokens as a browser
 * session.
 */
export default function MeetingGatewayDonePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string>();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const flowNonce =
      sessionStorage.getItem(STATE_KEY) || params.get('flow_nonce');
    if (!flowNonce) {
      void navigate('/meetings', { replace: true });
      return;
    }

    const accessToken = params.get('access_token');
    const tokenType = params.get('token_type');
    const expiresInRaw = params.get('expires_in');
    const connectionId = params.get('connection_id');
    const memberId = params.get('member_id');
    const status = params.get('status');
    const expiresIn = expiresInRaw ? Number(expiresInRaw) : NaN;

    stripCallbackSecretsFromUrl();

    const body =
      accessToken &&
      tokenType &&
      Number.isInteger(expiresIn) &&
      connectionId &&
      memberId &&
      status
        ? {
            state: flowNonce,
            accessToken,
            tokenType,
            expiresIn,
            connectionId,
            memberId,
            status,
          }
        : { state: flowNonce };

    void api
      .request({
        path: 'meetingGateway/bindings/complete',
        method: 'POST',
        json: body,
      })
      .then(() => {
        sessionStorage.removeItem(STATE_KEY);
        void navigate('/meetings', { replace: true });
      })
      .catch((next: unknown) => {
        const message =
          next instanceof ApiClientError
            ? next.message
            : t('meetings.loginFailed');
        setError(message);
      });
  }, [api, navigate, params, t]);

  return (
    <PageContainer>
      <PageHeader title={t('meetingConnections.completing')} />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </PageContainer>
  );
}
