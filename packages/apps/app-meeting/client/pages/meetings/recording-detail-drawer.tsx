import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
import { formatBeijingInstant } from './oa-time.js';

interface RecordingDoc {
  fileType: string | null;
  downloadUrl: string | null;
  available: boolean;
}

interface RecordingInfo {
  userId: string | null;
  topic: string | null;
  startAt: string | null;
  endAt: string | null;
}

interface RecordingDetail {
  meetingId: string;
  recordFileId: string;
  viewAddress: string | null;
  downloadAddress: string | null;
  downloadAddressFileType: string | null;
  audioAddress: string | null;
  audioAddressFileType: string | null;
  meetingSummary: readonly RecordingDoc[];
  aiMeetingTranscripts: readonly RecordingDoc[];
  aiMinutes: readonly RecordingDoc[];
  aiTopicMinutes: readonly RecordingDoc[];
  aiSpeakerMinutes: readonly RecordingDoc[];
  aiDsMinutes: readonly RecordingDoc[];
  recordInfo: readonly RecordingInfo[];
  fetchedAt: string;
}

const DOC_GROUPS = [
  { key: 'meetingSummary', label: 'meetings.docMeetingSummary' },
  { key: 'aiMeetingTranscripts', label: 'meetings.docAiTranscripts' },
  { key: 'aiMinutes', label: 'meetings.docAiMinutes' },
  { key: 'aiTopicMinutes', label: 'meetings.docTopicMinutes' },
  { key: 'aiSpeakerMinutes', label: 'meetings.docSpeakerMinutes' },
  { key: 'aiDsMinutes', label: 'meetings.docDsMinutes' },
] as const;

const FORMAT_ORDER = ['txt', 'docx', 'pdf'] as const;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Keep only https links. Illegal or missing addresses stay unclickable. */
function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function formatRank(fileType: string | null): number {
  const normalized = fileType?.trim().toLowerCase() ?? '';
  const index = FORMAT_ORDER.indexOf(
    normalized as (typeof FORMAT_ORDER)[number],
  );
  return index === -1 ? FORMAT_ORDER.length : index;
}

function downloadableDocs(entries: readonly RecordingDoc[]): RecordingDoc[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        entry.available && safeHttpsUrl(entry.downloadUrl) !== null,
    )
    .sort((left, right) => {
      const rank =
        formatRank(left.entry.fileType) - formatRank(right.entry.fileType);
      return rank === 0 ? left.index - right.index : rank;
    })
    .map(({ entry }) => entry);
}

function ExternalLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='underline'
    >
      {children}
    </a>
  );
}

function DocumentGroup({
  title,
  entries,
}: {
  readonly title: string;
  readonly entries: readonly RecordingDoc[];
}): ReactElement {
  const { t } = useTranslation();
  const docs = downloadableDocs(entries);
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const key = doc.fileType?.trim().toLowerCase() ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const items = docs.map((doc, index) => {
    const key = doc.fileType?.trim().toLowerCase() ?? '';
    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
    const base = doc.fileType?.trim()
      ? doc.fileType.trim().toUpperCase()
      : t('meetings.formatNotProvided');
    const total = counts.get(key) ?? 0;
    return {
      key: `${key}-${index}`,
      href: safeHttpsUrl(doc.downloadUrl) ?? '',
      label: total > 1 ? `${base} #${next}` : base,
    };
  });

  return (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <span>{title}</span>
      {items.length === 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' size='sm' variant='outline' disabled>
            {t('meetings.downloadDocument')}
          </Button>
          <span className='text-muted-foreground'>
            {t('meetings.noDownloadableFiles')}
          </span>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type='button' size='sm' variant='outline' />}
          >
            {t('meetings.downloadDocument')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {items.map((item) => (
              <DropdownMenuItem
                key={item.key}
                render={
                  <a
                    href={item.href}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function RecordingDetailDrawer({
  open,
  onOpenChange,
  meetingId,
  meetingCode,
  recordFileId,
  allowDownload = null,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly meetingId: string;
  readonly meetingCode: string;
  readonly recordFileId: string;
  readonly allowDownload?: boolean | null;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const requestSeqRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [payload, setPayload] = useState<RecordingDetail | null>(null);
  const codeText = meetingCode.trim() ? meetingCode : t('meetings.notProvided');
  const title = `${codeText} · ${recordFileId}`;
  const active = open && Boolean(meetingId) && Boolean(recordFileId);

  useEffect(() => {
    if (!active) {
      return;
    }
    const seq = ++requestSeqRef.current;
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || seq !== requestSeqRef.current) return;
      setLoading(true);
      setError(undefined);
      setPayload(null);
      void api
        .request<{ data: RecordingDetail }>({
          path: `meetings/${meetingId}/recordings/${encodeURIComponent(recordFileId)}/detail`,
          method: 'GET',
          signal: controller.signal,
        })
        .then((result) => {
          if (seq !== requestSeqRef.current) return;
          setPayload(result.data);
          setLoading(false);
        })
        .catch((caught: unknown) => {
          if (seq !== requestSeqRef.current || isAbortError(caught)) return;
          setPayload(null);
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : t('meetings.queryFailed'),
          );
          setLoading(false);
        });
    });
    return () => {
      cancelled = true;
      requestSeqRef.current += 1;
      controller.abort();
    };
  }, [active, api, attempt, meetingId, recordFileId, t]);

  const viewUrl = safeHttpsUrl(payload?.viewAddress);
  const downloadUrl = safeHttpsUrl(payload?.downloadAddress);
  const audioUrl = safeHttpsUrl(payload?.audioAddress);
  const canDownload = allowDownload !== false && downloadUrl !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='w-[min(100%,60vw)] overflow-hidden sm:max-w-none data-[side=right]:w-[min(100%,60vw)] data-[side=right]:sm:max-w-none'
      >
        <SheetHeader className='pr-10'>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{recordFileId}</SheetDescription>
        </SheetHeader>
        <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4'>
          {loading ? <p className='text-sm'>{t('meetings.loading')}</p> : null}
          {error ? (
            <div className='space-y-2'>
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t('meetings.refreshDetail')}
              </Button>
            </div>
          ) : null}
          {payload ? (
            <>
              <section className='space-y-2'>
                <h3 className='font-medium'>{t('meetings.mediaSection')}</h3>
                <ul className='space-y-2'>
                  <li className='flex flex-wrap items-center gap-2'>
                    {viewUrl ? (
                      <ExternalLink href={viewUrl}>
                        {t('meetings.openTencentRecording')}
                      </ExternalLink>
                    ) : (
                      <span>
                        {t('meetings.openTencentRecording')}:{' '}
                        {t('meetings.notProvided')}
                      </span>
                    )}
                  </li>
                  <li className='flex flex-wrap items-center gap-2'>
                    {canDownload && downloadUrl ? (
                      <ExternalLink href={downloadUrl}>
                        {t('meetings.downloadMedia')}
                      </ExternalLink>
                    ) : (
                      <span>
                        {t('meetings.downloadMedia')}:{' '}
                        {t('meetings.notProvided')}
                      </span>
                    )}
                    <span className='text-muted-foreground'>
                      {payload.downloadAddressFileType?.trim() ||
                        t('meetings.notProvided')}
                    </span>
                  </li>
                  <li className='flex flex-wrap items-center gap-2'>
                    {audioUrl ? (
                      <ExternalLink href={audioUrl}>
                        {t('meetings.openAudio')}
                      </ExternalLink>
                    ) : (
                      <span>
                        {t('meetings.openAudio')}: {t('meetings.notProvided')}
                      </span>
                    )}
                    <span className='text-muted-foreground'>
                      {payload.audioAddressFileType?.trim() ||
                        t('meetings.notProvided')}
                    </span>
                  </li>
                </ul>
              </section>
              <section className='space-y-2'>
                <h3 className='font-medium'>
                  {t('meetings.documentsSection')}
                </h3>
                <div className='space-y-2'>
                  {DOC_GROUPS.map((group) => (
                    <DocumentGroup
                      key={group.key}
                      title={t(group.label)}
                      entries={payload[group.key]}
                    />
                  ))}
                </div>
              </section>
              <section className='space-y-2'>
                <h3 className='font-medium'>
                  {t('meetings.recordInfoSection')}
                </h3>
                {payload.recordInfo.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('meetings.noRecordInfo')}
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full border-collapse text-left text-sm'>
                      <thead>
                        <tr>
                          <th
                            className='border-b px-2 py-1 font-medium'
                            scope='col'
                          >
                            {t('meetings.recordInfoUserId')}
                          </th>
                          <th
                            className='border-b px-2 py-1 font-medium'
                            scope='col'
                          >
                            {t('meetings.recordInfoTopic')}
                          </th>
                          <th
                            className='border-b px-2 py-1 font-medium'
                            scope='col'
                          >
                            {t('meetings.recordInfoStart')}
                          </th>
                          <th
                            className='border-b px-2 py-1 font-medium'
                            scope='col'
                          >
                            {t('meetings.recordInfoEnd')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.recordInfo.map((info) => (
                          <tr
                            key={[
                              info.userId ?? 'user',
                              info.topic ?? '',
                              info.startAt ?? '',
                              info.endAt ?? '',
                            ].join('|')}
                          >
                            <td className='border-b px-2 py-1'>
                              {info.userId?.trim() || t('meetings.notProvided')}
                            </td>
                            <td className='border-b px-2 py-1'>
                              {info.topic?.trim() || t('meetings.notProvided')}
                            </td>
                            <td className='border-b px-2 py-1'>
                              {formatBeijingInstant(
                                info.startAt,
                                t('meetings.notProvided'),
                              )}
                            </td>
                            <td className='border-b px-2 py-1'>
                              {formatBeijingInstant(
                                info.endAt,
                                t('meetings.notProvided'),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
