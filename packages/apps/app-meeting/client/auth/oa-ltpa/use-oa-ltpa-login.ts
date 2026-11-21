import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface OaSsoStatus {
  readonly enabled: boolean;
  readonly oaLoginUrl?: string;
}

type AuthErrorBody = {
  readonly code?: string;
  readonly message?: string;
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;
  const body = record.body ?? record.data;
  if (body && typeof body === 'object') {
    const code = (body as AuthErrorBody).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export function useOaLtpaLogin(): {
  readonly status: OaSsoStatus | undefined;
  readonly statusLoading: boolean;
  readonly isPending: boolean;
  readonly error: string | undefined;
  readonly submit: () => Promise<void>;
} {
  const api = useApiClient();
  const { client, refresh } = useAuthentication();
  const { t } = useTranslation();
  const [status, setStatus] = useState<OaSsoStatus>();
  const [statusLoading, setStatusLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .request<{ data?: OaSsoStatus }>({
        path: 'meeting-oa-sso/status',
        method: 'GET',
      })
      .then((response) => {
        if (cancelled) return;
        setStatus({
          enabled: response.data?.enabled === true,
          oaLoginUrl: response.data?.oaLoginUrl,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ enabled: false });
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const submit = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsPending(true);
    setError(undefined);
    try {
      // Better Auth / API middleware require application/json on POST even
      // when the body is empty; cookie identity is read server-side.
      const result = await client.$fetch('/sign-in/oa-ltpa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {},
      });
      if (result.error) {
        const code = errorCode(result.error);
        const message =
          (code
            ? t(`meetingOaSso.errors.${code}`, {
                defaultValue: '',
              })
            : '') ||
          (typeof (result.error as { message?: string }).message === 'string'
            ? (result.error as { message: string }).message
            : '') ||
          t('meetingOaSso.errors.unknown');
        setError(message);
        return;
      }
      await refresh();
    } catch (caught) {
      const code = errorCode(caught);
      setError(
        (code ? t(`meetingOaSso.errors.${code}`, { defaultValue: '' }) : '') ||
          t('meetingOaSso.errors.unknown'),
      );
    } finally {
      inFlightRef.current = false;
      setIsPending(false);
    }
  }, [client, refresh, t]);

  return { status, statusLoading, isPending, error, submit };
}
