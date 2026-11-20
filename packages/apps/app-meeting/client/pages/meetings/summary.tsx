import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import { Input } from '#components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useListData } from '#hooks/use-list-data';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
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

function findMatchOffsets(
  text: string,
  query: string,
): readonly { start: number; end: number }[] {
  const needle = query.trim();
  if (!needle) return [];
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const ranges: { start: number; end: number }[] = [];
  let from = 0;
  while (from <= haystack.length - target.length) {
    const index = haystack.indexOf(target, from);
    if (index < 0) break;
    ranges.push({ start: index, end: index + target.length });
    from = index + target.length;
  }
  return ranges;
}

function HighlightedDialogue({
  text,
  query,
  activeIndex,
}: {
  readonly text: string;
  readonly query: string;
  readonly activeIndex: number;
}): ReactElement {
  const matchElsRef = useRef<(HTMLElement | null)[]>([]);
  const ranges = useMemo(() => findMatchOffsets(text, query), [text, query]);

  useEffect(() => {
    matchElsRef.current = matchElsRef.current.slice(0, ranges.length);
  }, [ranges.length]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= ranges.length) return;
    const node = matchElsRef.current[activeIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }
  }, [activeIndex, ranges.length]);

  if (!ranges.length) {
    return <>{text}</>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    const active = index === activeIndex;
    nodes.push(
      <mark
        key={`${range.start}-${range.end}`}
        ref={(node) => {
          matchElsRef.current[index] = node;
        }}
        className={
          active
            ? 'rounded-sm bg-primary px-0.5 text-primary-foreground'
            : 'rounded-sm bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/40'
        }
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return <>{nodes}</>;
}

function DialoguePanel({
  text,
  emptyKey,
}: {
  readonly text: string;
  readonly emptyKey: string;
}): ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ranges = useMemo(() => findMatchOffsets(text, query), [text, query]);
  const total = ranges.length;
  const safeActiveIndex = total === 0 ? -1 : Math.min(activeIndex, total - 1);

  if (!text.trim()) {
    return <MeetingEmptyState title={t(emptyKey)} />;
  }

  const go = (delta: number) => {
    if (total === 0) return;
    setActiveIndex((current) => {
      const base = Math.min(current, total - 1);
      return (base + delta + total) % total;
    });
  };

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-0 flex-1'>
          <SearchIcon
            aria-hidden='true'
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                go(event.shiftKey ? -1 : 1);
              }
            }}
            placeholder={t('meetings.summary.searchPlaceholder')}
            aria-label={t('meetings.summary.searchPlaceholder')}
            className='pl-8'
          />
        </div>
        <p className='shrink-0 text-xs text-muted-foreground tabular-nums'>
          {query.trim()
            ? total > 0
              ? t('meetings.summary.searchMatches', {
                  current: safeActiveIndex + 1,
                  total,
                })
              : t('meetings.summary.searchNoMatch')
            : null}
        </p>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          disabled={total === 0}
          aria-label={t('meetings.summary.searchPrev')}
          onClick={() => go(-1)}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          disabled={total === 0}
          aria-label={t('meetings.summary.searchNext')}
          onClick={() => go(1)}
        >
          <ChevronDownIcon />
        </Button>
      </div>
      <pre className='min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 text-sm ring-1 ring-foreground/10'>
        <HighlightedDialogue
          text={text}
          query={query}
          activeIndex={safeActiveIndex}
        />
      </pre>
    </div>
  );
}

export default function MeetingSummaryPage(): ReactElement {
  const { t } = useTranslation();
  const { meetingId = '' } = useParams();
  const [dialoguesOpen, setDialoguesOpen] = useState(false);
  const [dialogueTab, setDialogueTab] = useState('original');
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
      <Card>
        <CardContent className='pt-6'>
          <Tabs defaultValue='ai_ds_minutes'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
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
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='shrink-0 self-end sm:self-auto'
                onClick={() => setDialoguesOpen(true)}
              >
                {t('meetings.summary.dialogues')}
              </Button>
            </div>
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
      <Sheet
        open={dialoguesOpen}
        onOpenChange={(open) => {
          setDialoguesOpen(open);
          if (!open) setDialogueTab('original');
        }}
      >
        <SheetContent
          side='right'
          className='w-[min(100%,40rem)] overflow-hidden sm:max-w-none data-[side=right]:w-[min(100%,40rem)] data-[side=right]:sm:max-w-none'
        >
          <SheetHeader className='pr-10'>
            <SheetTitle>{t('meetings.summary.dialogues')}</SheetTitle>
          </SheetHeader>
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4'>
            <Tabs
              value={dialogueTab}
              onValueChange={setDialogueTab}
              className='flex min-h-0 flex-1 flex-col'
            >
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
              <TabsContent
                value='original'
                className='flex min-h-0 flex-1 flex-col pt-4 data-[hidden]:hidden'
              >
                <DialoguePanel
                  key={`original-${dialoguesOpen}`}
                  text={dialogues?.original ?? ''}
                  emptyKey='meetings.summaryEmptyDialogue'
                />
              </TabsContent>
              <TabsContent
                value='optimized'
                className='flex min-h-0 flex-1 flex-col pt-4 data-[hidden]:hidden'
              >
                <DialoguePanel
                  key={`optimized-${dialoguesOpen}`}
                  text={dialogues?.optimized ?? ''}
                  emptyKey='meetings.summaryEmptyDialogue'
                />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
