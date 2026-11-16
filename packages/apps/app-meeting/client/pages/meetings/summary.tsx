import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '#components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { useParams } from 'react-router';
import {
  MeetingEmptyState,
  MeetingLoading,
  MeetingUnavailable,
} from './meeting-feedback.js';

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
    return <MeetingEmptyState title={t(emptyKey)} />;
  }
  return (
    <pre className='max-h-[min(70vh,36rem)] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 text-sm ring-1 ring-foreground/10'>
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
    return <MeetingUnavailable onRetry={() => contentRequest.reload()} />;
  }

  if (contentRequest.loading && !content) {
    return <MeetingLoading />;
  }

  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>{t('meetings.summaryReadOnly')}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <h2 className='font-heading text-base font-medium'>
            {t('meetings.summaryTitle')}
          </h2>
          <CardDescription>{t('meetings.summaryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
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
              <TabsContent key={value} value={value} className='pt-4'>
                <SourcePanel
                  text={minutes?.[value] ?? ''}
                  emptyKey='meetings.summaryEmptyMinutes'
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className='font-heading text-base font-medium'>
            {t('meetings.summary.dialogues')}
          </h2>
        </CardHeader>
        <CardContent>
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
            <TabsContent value='original' className='pt-4'>
              <SourcePanel
                text={dialogues?.original ?? ''}
                emptyKey='meetings.summaryEmptyDialogue'
              />
            </TabsContent>
            <TabsContent value='optimized' className='pt-4'>
              <SourcePanel
                text={dialogues?.optimized ?? ''}
                emptyKey='meetings.summaryEmptyDialogue'
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
