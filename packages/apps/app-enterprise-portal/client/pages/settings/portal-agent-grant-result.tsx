import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  agentGrantResultKind,
  operationNeedsOctopRefresh,
  type AgentGrantOperation,
} from './portal-agent-grants-model.js';

export function AgentGrantResultAlert({
  operation,
  onRefresh,
  onReconcile,
}: {
  readonly operation: AgentGrantOperation | undefined;
  readonly onRefresh: () => void;
  readonly onReconcile: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!operation) return null;
  const resultKind = agentGrantResultKind(operation);
  const pendingOctopRefresh = operationNeedsOctopRefresh(resultKind);
  return (
    <Alert className='mb-4'>
      <AlertTitle>
        {resultKind === 'COMPLETED'
          ? t('settings.portalAgentGrantsCompleted')
          : resultKind === 'PARTIAL'
            ? t('settings.portalAgentGrantsPartial')
            : resultKind === 'BOOTSTRAP_PENDING'
              ? t('settings.portalAgentGrantsBootstrapPending')
              : resultKind === 'OUTCOME_UNKNOWN'
                ? t('settings.portalAgentGrantsOutcomeUnknown')
                : t('settings.portalAgentGrantsUserCreated')}
      </AlertTitle>
      <AlertDescription>
        <div className='space-y-1 text-sm'>
          <div>
            {t('settings.portalAgentGrantsOctopUserId')}:{' '}
            {operation.octopUserId ?? '—'}
          </div>
          <div>
            {operation.completedExpertCount}/{operation.selectedExpertCount}{' '}
            {t('settings.portalAgentGrantsExpertsProgress')}
          </div>
          {operation.errorMessage ? <div>{operation.errorMessage}</div> : null}
        </div>
        <div className='mt-3 flex gap-2'>
          <Button type='button' variant='outline' onClick={onRefresh}>
            {t('settings.portalAgentGrantsRefreshStatus')}
          </Button>
          {pendingOctopRefresh ? (
            <Button type='button' onClick={onReconcile}>
              {t('settings.portalAgentGrantsReconcile')}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
