import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

interface Content {
  tencentMinutes?: {
    ai_ds_minutes: string;
    ai_minutes: string;
    ai_speaker_minutes: string;
    ai_topic_minutes: string;
  };
  tencentDialogues?: {
    original: string;
    optimized: string;
  };
}

const MINUTES_TABS = [
  ['ai_ds_minutes', 'meetings.summary.deepseek'],
  ['ai_minutes', 'meetings.summary.chapters'],
  ['ai_speaker_minutes', 'meetings.summary.speaker'],
  ['ai_topic_minutes', 'meetings.summary.topic'],
] as const;

function SourcePanel({
  text,
  emptyKey,
}: {
  readonly text: string;
  readonly emptyKey: string;
}): ReactElement {
  const { t } = useTranslation();
  if (!text.trim()) {
    return <p className='text-sm text-muted-foreground'>{t(emptyKey)}</p>;
  }
  return (
    <pre className='max-h-[min(70vh,36rem)] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm'>
      {text}
    </pre>
  );
}

export default function MeetingSummaryPage(): ReactElement {
  const { t } = useTranslation();
  const { meetingId = '' } = useParams();
  const contentRequest = useListData<{ data: Content }>(
    `meetings/${meetingId}/content`,
    { scopes: ['meetings'] },
  );
  const content = contentRequest.data?.data;
  const minutes = content?.tencentMinutes;
  const dialogues = content?.tencentDialogues;

  if (contentRequest.error) {
    return (
      <div className='flex flex-col gap-3'>
        <Alert variant='destructive'>
          <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
        </Alert>
        <Button
          type='button'
          variant='outline'
          onClick={() => contentRequest.reload()}
        >
          {t('meetings.retry')}
        </Button>
        <Link className='text-sm underline' to={`/meetings/${meetingId}/oa`}>
          {t('meetings.tabs.oa')}
        </Link>
      </div>
    );
  }

  if (contentRequest.loading && !content) {
    return (
      <p className='text-sm text-muted-foreground'>{t('meetings.loading')}</p>
    );
  }

  return (
    <section className='flex max-w-4xl flex-col gap-6'>
      <div>
        <h2 className='text-base font-medium'>{t('meetings.summaryTitle')}</h2>
        <p className='text-sm text-muted-foreground'>
          {t('meetings.summaryDescription')}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t('meetings.summaryReadOnly')}
        </p>
      </div>
      <Tabs defaultValue='ai_ds_minutes'>
        <TabsList
          aria-label={t('meetings.summaryTitle')}
          className='h-auto max-w-full flex-wrap justify-start overflow-x-auto'
        >
          {MINUTES_TABS.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {MINUTES_TABS.map(([value]) => (
          <TabsContent key={value} value={value}>
            <SourcePanel
              text={minutes?.[value] ?? ''}
              emptyKey='meetings.summaryEmptyMinutes'
            />
          </TabsContent>
        ))}
      </Tabs>
      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-medium'>
          {t('meetings.summary.dialogues')}
        </h3>
        <Tabs defaultValue='original'>
          <TabsList
            aria-label={t('meetings.summary.dialogues')}
            className='h-auto max-w-full flex-wrap justify-start overflow-x-auto'
          >
            <TabsTrigger value='original'>
              {t('meetings.summary.original')}
            </TabsTrigger>
            <TabsTrigger value='optimized'>
              {t('meetings.summary.optimized')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='original'>
            <SourcePanel
              text={dialogues?.original ?? ''}
              emptyKey='meetings.summaryEmptyDialogue'
            />
          </TabsContent>
          <TabsContent value='optimized'>
            <SourcePanel
              text={dialogues?.optimized ?? ''}
              emptyKey='meetings.summaryEmptyDialogue'
            />
          </TabsContent>
        </Tabs>
      </section>
      <Link className='text-sm underline' to={`/meetings/${meetingId}/oa`}>
        {t('meetings.tabs.oa')}
      </Link>
    </section>
  );
}
