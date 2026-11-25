import { useApiClient } from '@nocobase/app-client';
import { useEffect } from 'react';

import {
  agentGrantReconcilePath,
  agentGrantResultKind,
  operationNeedsOctopRefresh,
  type AgentGrantOperation,
} from './portal-agent-grants-model.js';
import { readOperation } from './portal-agent-grants-parsers.js';

/**
 * Poll Octop while a create/install operation is still pending. A stored GET
 * would stay stale, so each tick posts reconcile.
 */
export function usePolledAgentGrantOperation(
  operation: AgentGrantOperation | undefined,
  onUpdate: (operation: AgentGrantOperation | undefined) => void,
): void {
  const api = useApiClient();
  const operationId = operation?.id;
  const pending = operationNeedsOctopRefresh(
    operation ? agentGrantResultKind(operation) : undefined,
  );

  useEffect(() => {
    if (!operationId || !pending) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await api.request<unknown>({
            method: 'POST',
            path: agentGrantReconcilePath(operationId),
          });
          if (cancelled) return;
          onUpdate(readOperation(response));
        } catch {
          // The next tick retries. Manual refresh still surfaces errors.
        }
      })();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, onUpdate, operationId, pending]);
}
