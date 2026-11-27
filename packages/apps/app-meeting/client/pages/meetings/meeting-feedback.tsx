import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';
import { Alert, AlertDescription } from '#components/ui/alert';
import { useTranslation } from '@nocobase/i18n/client';
import { InboxIcon } from 'lucide-react';
import { type ReactElement } from 'react';

export function MeetingLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
      <Spinner />
      <span>{t('meetings.loading')}</span>
    </div>
  );
}

export function MeetingEmptyState({
  title,
}: {
  readonly title: string;
}): ReactElement {
  return (
    <Empty className='border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

export function MeetingUnavailable({
  onRetry,
}: {
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-3'>
      <Alert variant='destructive'>
        <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
      </Alert>
      {onRetry ? (
        <Button type='button' variant='outline' onClick={onRetry}>
          {t('meetings.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function MeetingEmptyHint({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}): ReactElement {
  return (
    <Empty className='border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
