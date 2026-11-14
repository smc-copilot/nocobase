import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState } from 'react';

export interface AgentClientRow {
  readonly clientId: string;
  readonly name: string;
  readonly instanceLabel: string | null;
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly enabled: boolean;
  readonly secretVersion: number;
}

export interface AgentClientCreated extends AgentClientRow {
  readonly clientSecret: string;
}

export interface AgentGrantRow {
  readonly grantId: string;
  readonly clientId: string;
  readonly localUserId: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly status: string;
  readonly expiresAt: string | null;
}

export interface AgentAuditEvent {
  readonly id: string;
  readonly clientId: string | null;
  readonly localUserId: string | null;
  readonly grantId: string | null;
  readonly action: string;
  readonly decision: string;
  readonly createdAt: string;
}

export const AGENT_SCOPES = ['business-ui:view', 'business-ui:edit'] as const;

export function useAgentList<T>(
  path: string,
  reloadKey: number,
): { readonly data: readonly T[] | undefined; readonly error: string | null } {
  const api = useApiClient();
  const { t } = useTranslation();
  const [data, setData] = useState<readonly T[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const request = new AbortController();
    void api.request<{ data: T[] }>({ path, signal: request.signal }).then(
      (body) => {
        if (request.signal.aborted) return;
        setData(body.data);
        setError(null);
      },
      (caught: unknown) => {
        if (request.signal.aborted) return;
        const reason =
          caught instanceof ApiClientError ? caught.reason : undefined;
        const message = t('agentAuthorization.requestFailed');
        setError(reason ? `${message} (${reason})` : message);
      },
    );
    return () => request.abort();
  }, [api, path, reloadKey, t]);

  return { data, error };
}
