import {
  ApiClientError,
  createUuid,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { useListData } from '#hooks/use-list-data';
import { beijingWallToIso, isoToBeijingInput } from './oa-time.js';
import { PersonChips, type OaPersonChip } from './person-chips.js';
import { SupplementalFilesPanel } from './supplemental-files.js';
import { TaskTable, type DraftTaskRow } from './task-table.js';

interface Identity {
  userId: string;
  employeeNo: string | null;
  canSync: boolean;
  denyReason: string | null;
}

interface Draft {
  meetingId: string;
  version: number;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  purpose: string | null;
  remark: string | null;
  otherAttendPerson: string | null;
  attendeeEmployeeNos?: readonly string[];
  attendeeSnapshots?: readonly OaPersonChip[];
  emceeSnapshot?: OaPersonChip | null;
  hostSnapshot?: OaPersonChip | null;
  actualAttendSnapshots?: readonly OaPersonChip[];
  copyToSnapshots?: readonly OaPersonChip[];
  summaryTitle?: string | null;
  summary: string | null;
  summaryCompleteTime?: string | null;
  tasks: DraftTaskRow[];
  frozen?: boolean;
  operationId?: string | null;
  writesOa: false;
  isolationAdapter: boolean;
}

interface Content {
  minutes: { text: string; source: string };
  sourceTodos: { title: string; description: string }[];
  localMinutesEdited: boolean;
  importStatus: string;
  lastImportError: string | null;
  liveGatewayImport: string;
}

function asTasks(rows: Draft['tasks'] | undefined): DraftTaskRow[] {
  return (rows ?? []).map((task) => ({
    clientTaskId: task.clientTaskId,
    title: task.title,
    assigneeEmployeeNo: task.assigneeEmployeeNo ?? null,
    assigneeName: task.assigneeName ?? null,
    appointEmployeeNo: task.appointEmployeeNo ?? null,
    appointName: task.appointName ?? null,
    attentionEmployeeNos: task.attentionEmployeeNos ?? [],
    attentionSnapshots: task.attentionSnapshots ?? [],
    startAt: task.startAt ?? null,
    dueAt: task.dueAt ?? null,
    description: task.description ?? null,
    fromSourceTodo: task.fromSourceTodo ?? false,
  }));
}

export default function MeetingOaPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const { meetingId = '' } = useParams();
  const identity = useListData<{ data: Identity }>('meetingOa/identity', {
    scopes: ['meetings'],
  });
  const draftRequest = useListData<{ data: Draft }>(
    `meetings/${meetingId}/oa-draft`,
    { scopes: ['meetings'] },
  );
  const contentRequest = useListData<{ data: Content }>(
    `meetings/${meetingId}/content`,
    { scopes: ['meetings'] },
  );
  const draft = draftRequest.data?.data;
  const identityRow = identity.data?.data;
  const content = contentRequest.data?.data;
  const [title, setTitle] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [remark, setRemark] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [endAt, setEndAt] = useState<string | null>(null);
  const [otherAttendPerson, setOtherAttendPerson] = useState<string | null>(
    null,
  );
  const [summaryTitle, setSummaryTitle] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryCompleteTime, setSummaryCompleteTime] = useState<string | null>(
    null,
  );
  const [attendees, setAttendees] = useState<OaPersonChip[] | null>(null);
  const [emcee, setEmcee] = useState<OaPersonChip[] | null>(null);
  const [host, setHost] = useState<OaPersonChip[] | null>(null);
  const [actualAttend, setActualAttend] = useState<OaPersonChip[] | null>(null);
  const [copyTo, setCopyTo] = useState<OaPersonChip[] | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [tasks, setTasks] = useState<DraftTaskRow[] | null>(null);
  const persistLockRef = useRef(false);
  const persistGenerationRef = useRef(0);

  const shownTitle = title ?? draft?.title ?? '';
  const shownPurpose = purpose ?? draft?.purpose ?? '';
  const shownRemark = remark ?? draft?.remark ?? '';
  const shownLocation = location ?? draft?.location ?? '';
  const shownStart = startAt ?? isoToBeijingInput(draft?.startAt);
  const shownEnd = endAt ?? isoToBeijingInput(draft?.endAt);
  const shownOther = otherAttendPerson ?? draft?.otherAttendPerson ?? '';
  const shownSummaryTitle = summaryTitle ?? draft?.summaryTitle ?? '';
  const shownSummary = summary ?? draft?.summary ?? '';
  const shownComplete =
    summaryCompleteTime ?? isoToBeijingInput(draft?.summaryCompleteTime);
  const shownAttendees = attendees ?? [...(draft?.attendeeSnapshots ?? [])];
  const creatorPerson = identityRow?.employeeNo
    ? {
        fd_no: identityRow.employeeNo,
        fd_name: identityRow.employeeNo,
        fd_department: '',
      }
    : null;
  const shownEmcee =
    emcee ??
    (draft?.emceeSnapshot
      ? [draft.emceeSnapshot]
      : creatorPerson
        ? [creatorPerson]
        : []);
  const shownHost =
    host ??
    (draft?.hostSnapshot
      ? [draft.hostSnapshot]
      : creatorPerson
        ? [creatorPerson]
        : []);
  const shownActual = actualAttend ?? [...(draft?.actualAttendSnapshots ?? [])];
  const shownCopyTo = copyTo ?? [...(draft?.copyToSnapshots ?? [])];
  const shownTasks = tasks ?? asTasks(draft?.tasks);
  const currentVersion = savedVersion ?? draft?.version;
  const frozen = Boolean(draft?.frozen);
  const isolation = useMemo(() => t('meetingOa.isolationBanner'), [t]);

  const searchPeople = useCallback(
    async (query: string) => {
      const result = await api.request<{ data: OaPersonChip[] }>({
        path: 'meetingOa/people',
        query: { q: query },
      });
      return result.data;
    },
    [api],
  );

  const persistDraft = async (
    nextTasks: DraftTaskRow[] = shownTasks,
  ): Promise<Draft | undefined> => {
    if (!draft || currentVersion == null) return undefined;
    const generation = persistGenerationRef.current + 1;
    persistGenerationRef.current = generation;
    const result = await api.request<{ data: Draft }>({
      path: `meetings/${meetingId}/oa-draft`,
      method: 'PUT',
      json: {
        expectedVersion: currentVersion,
        title: shownTitle,
        purpose: shownPurpose,
        remark: shownRemark,
        location: shownLocation,
        startAt: beijingWallToIso(shownStart),
        endAt: beijingWallToIso(shownEnd),
        otherAttendPerson: shownOther,
        attendeeEmployeeNos: shownAttendees.map((row) => row.fd_no),
        attendeeSnapshots: shownAttendees,
        emceeSnapshot: shownEmcee[0] ?? null,
        hostSnapshot: shownHost[0] ?? null,
        actualAttendSnapshots: shownActual,
        copyToSnapshots: shownCopyTo,
        summaryTitle: shownSummaryTitle,
        summary: shownSummary,
        summaryCompleteTime: shownComplete
          ? beijingWallToIso(shownComplete)
          : null,
        tasks: nextTasks,
      },
    });
    if (generation !== persistGenerationRef.current) {
      setSavedVersion((previous) =>
        previous == null || result.data.version > previous
          ? result.data.version
          : previous,
      );
      return result.data;
    }
    setSavedVersion(result.data.version);
    setTasks([...(asTasks(result.data.tasks) ?? nextTasks)]);
    void draftRequest.reload();
    return result.data;
  };

  const save = async (nextTasks: DraftTaskRow[] = shownTasks) => {
    if (!draft || persistLockRef.current) return;
    persistLockRef.current = true;
    setBusy(true);
    try {
      await persistDraft(nextTasks);
      toaster.show({ type: 'success', title: t('meetingOa.draftSaved') });
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetingOa.draftFailed'),
      });
    } finally {
      persistLockRef.current = false;
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!draft || persistLockRef.current) return;
    persistLockRef.current = true;
    setBusy(true);
    try {
      const saved = await persistDraft(shownTasks);
      if (!saved) return;
      const result = await api.request<{ data: { id: string } }>({
        path: 'meetingOa/operations',
        method: 'POST',
        json: {
          meetingId,
          requestId: createUuid(),
          expectedDraftVersion: saved.version,
        },
      });
      void navigate(`/meeting-operations/${result.data.id}`);
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError
            ? error.message
            : t('meetingOa.syncFailed'),
      });
    } finally {
      persistLockRef.current = false;
      setBusy(false);
    }
  };

  if (draftRequest.error) {
    return (
      <div className='flex flex-col gap-3'>
        <Alert variant='destructive'>
          <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
        </Alert>
        <Button
          type='button'
          variant='outline'
          onClick={() => draftRequest.reload()}
        >
          {t('meetings.retry')}
        </Button>
      </div>
    );
  }

  return (
    <section className='flex flex-col gap-4'>
      <h2 className='text-base font-medium'>{t('meetingOa.workspaceTitle')}</h2>
      <p className='text-sm text-muted-foreground'>
        {t('meetingOa.workspaceDescription')}
      </p>
      <Alert>
        <AlertDescription>
          {draft?.isolationAdapter
            ? isolation
            : t('meetingOa.liveWriteBlocked')}
        </AlertDescription>
      </Alert>
      <p>
        <Link
          className='text-sm underline'
          to={`/meetings/${meetingId}/summary`}
        >
          {t('meetings.tabs.summary')}
        </Link>
      </p>
      {identityRow ? (
        <p className='text-sm text-muted-foreground'>
          {identityRow.canSync
            ? t('meetingOa.mappedAs', { employeeNo: identityRow.employeeNo })
            : t('meetingOa.mappingMissing')}
        </p>
      ) : null}
      {content?.lastImportError === 'IMPORT_CONTRACT_UNAVAILABLE' ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.importContractMissing')}
        </p>
      ) : content?.lastImportError ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.importFailed')}
        </p>
      ) : null}
      {content?.localMinutesEdited ? (
        <p className='text-sm'>{t('meetingOa.localMinutesKept')}</p>
      ) : null}
      {content?.sourceTodos?.length ? (
        <div className='text-sm'>
          <p className='font-medium'>{t('meetingOa.sourceTodos')}</p>
          <ul className='list-disc pl-5'>
            {content.sourceTodos.map((todo) => (
              <li key={todo.title}>{todo.title}</li>
            ))}
          </ul>
          <p className='text-muted-foreground'>
            {t('meetingOa.sourceTodosNotAssigned')}
          </p>
        </div>
      ) : null}
      {frozen ? (
        <Alert>
          <AlertDescription>{t('meetingOa.draftFrozen')}</AlertDescription>
        </Alert>
      ) : null}
      {frozen && draft?.operationId ? (
        <p>
          <Link
            className='text-sm underline'
            to={`/meeting-operations/${draft.operationId}`}
          >
            {t('meetingOa.viewOperation')}
          </Link>
        </p>
      ) : null}
      <SupplementalFilesPanel meetingId={meetingId} frozen={frozen} />
      {draft ? (
        <form
          className='grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            if (!frozen) void save();
          }}
        >
          <div className='flex flex-col gap-3'>
            <h3 className='text-sm font-medium'>{t('meetings.tabs.oa')}</h3>
            <p className='text-xs text-muted-foreground'>
              {t('meetingOa.beijingHint')}
            </p>
            <Label htmlFor='oa-title'>{t('meetingOa.fields.title')}</Label>
            <Input
              id='oa-title'
              value={shownTitle}
              disabled={frozen}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Label htmlFor='oa-purpose'>{t('meetingOa.fields.purpose')}</Label>
            <Input
              id='oa-purpose'
              value={shownPurpose}
              disabled={frozen}
              onChange={(event) => setPurpose(event.target.value)}
            />
            <Label htmlFor='oa-location'>
              {t('meetingOa.fields.location')}
            </Label>
            <Input
              id='oa-location'
              value={shownLocation}
              disabled={frozen}
              onChange={(event) => setLocation(event.target.value)}
            />
            <Label htmlFor='oa-start'>{t('meetingOa.fields.startAt')}</Label>
            <Input
              id='oa-start'
              type='datetime-local'
              value={shownStart}
              disabled={frozen}
              onChange={(event) => setStartAt(event.target.value)}
            />
            <Label htmlFor='oa-end'>{t('meetingOa.fields.endAt')}</Label>
            <Input
              id='oa-end'
              type='datetime-local'
              value={shownEnd}
              disabled={frozen}
              onChange={(event) => setEndAt(event.target.value)}
            />
            <Label htmlFor='oa-attendees'>
              {t('meetingOa.fields.attendees')}
            </Label>
            <PersonChips
              id='oa-attendees'
              mode='multi'
              value={shownAttendees}
              disabled={frozen}
              onSearch={searchPeople}
              onChange={setAttendees}
            />
            <Label htmlFor='oa-emcee'>{t('meetingOa.fields.emcee')}</Label>
            <PersonChips
              id='oa-emcee'
              mode='single'
              value={shownEmcee}
              disabled={frozen}
              onSearch={searchPeople}
              onChange={setEmcee}
            />
            <Label htmlFor='oa-host'>{t('meetingOa.fields.host')}</Label>
            <PersonChips
              id='oa-host'
              mode='single'
              value={shownHost}
              disabled={frozen}
              onSearch={searchPeople}
              onChange={setHost}
            />
            <Label htmlFor='oa-other'>
              {t('meetingOa.fields.otherAttendPerson')}
            </Label>
            <Input
              id='oa-other'
              value={shownOther}
              disabled={frozen}
              onChange={(event) => setOtherAttendPerson(event.target.value)}
            />
            <Label htmlFor='oa-remark'>{t('meetingOa.fields.remark')}</Label>
            <Textarea
              id='oa-remark'
              value={shownRemark}
              disabled={frozen}
              onChange={(event) => setRemark(event.target.value)}
            />
          </div>
          <div className='flex flex-col gap-3'>
            <Label htmlFor='oa-summary-title'>
              {t('meetingOa.fields.summaryTitle')}
            </Label>
            <Input
              id='oa-summary-title'
              value={shownSummaryTitle}
              disabled={frozen}
              onChange={(event) => setSummaryTitle(event.target.value)}
            />
            <Label htmlFor='oa-summary'>{t('meetingOa.fields.summary')}</Label>
            <Textarea
              id='oa-summary'
              value={shownSummary}
              disabled={frozen}
              onChange={(event) => setSummary(event.target.value)}
            />
            <Label htmlFor='oa-complete'>
              {t('meetingOa.fields.summaryCompleteTime')}
            </Label>
            <Input
              id='oa-complete'
              type='datetime-local'
              value={shownComplete}
              disabled={frozen}
              onChange={(event) => setSummaryCompleteTime(event.target.value)}
            />
            <p className='text-sm text-muted-foreground'>
              {t('meetingOa.fields.inputPerson')}:{' '}
              {identityRow?.employeeNo ?? t('meetings.notProvided')}
            </p>
            <Label htmlFor='oa-actual'>
              {t('meetingOa.fields.actualAttend')}
            </Label>
            <PersonChips
              id='oa-actual'
              mode='multi'
              value={shownActual}
              disabled={frozen}
              onSearch={searchPeople}
              onChange={setActualAttend}
            />
            <Label htmlFor='oa-copy'>{t('meetingOa.fields.copyTo')}</Label>
            <PersonChips
              id='oa-copy'
              mode='multi'
              value={shownCopyTo}
              disabled={frozen}
              onSearch={searchPeople}
              onChange={setCopyTo}
            />
          </div>
          <div className='md:col-span-2'>
            <TaskTable
              tasks={shownTasks}
              disabled={frozen}
              busy={busy}
              taskTitle={taskTitle}
              onTaskTitle={setTaskTitle}
              onSearch={searchPeople}
              onChange={(next) => {
                setTasks(next);
              }}
              onAdd={() => {
                if (busy || persistLockRef.current || !taskTitle.trim()) return;
                const previous = shownTasks.at(-1);
                const nextTasks = [
                  ...shownTasks,
                  {
                    clientTaskId: createUuid(),
                    title: taskTitle.trim(),
                    assigneeEmployeeNo: null,
                    assigneeName: null,
                    appointEmployeeNo:
                      previous?.appointEmployeeNo ??
                      identityRow?.employeeNo ??
                      null,
                    appointName: previous?.appointName ?? null,
                    attentionEmployeeNos: [],
                    attentionSnapshots: [],
                    startAt: null,
                    dueAt: null,
                    description: null,
                    fromSourceTodo: false,
                  },
                ];
                setTasks(nextTasks);
                setTaskTitle('');
                void save(nextTasks);
              }}
            />
          </div>
          <div className='flex flex-wrap gap-2 md:col-span-2'>
            <Button type='submit' disabled={busy || frozen}>
              {t('meetingOa.saveDraft')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              disabled={busy || frozen || !identityRow?.canSync}
              onClick={() => void sync()}
            >
              {t('meetingOa.submitSync')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={busy || frozen}
              onClick={() => {
                if (!window.confirm(t('meetingOa.refillConfirm'))) return;
                if (!draft || currentVersion == null) return;
                setBusy(true);
                void api
                  .request<{ data: Draft }>({
                    path: `meetings/${meetingId}/oa-draft/refill`,
                    method: 'POST',
                    json: { expectedVersion: currentVersion },
                  })
                  .then((result) => {
                    setSavedVersion(result.data.version);
                    setTitle(result.data.title);
                    setLocation(result.data.location);
                    setStartAt(isoToBeijingInput(result.data.startAt));
                    setEndAt(isoToBeijingInput(result.data.endAt));
                    setRemark(result.data.remark);
                    setSummary(result.data.summary);
                    void draftRequest.reload();
                  })
                  .catch((error: unknown) =>
                    toaster.show({
                      type: 'error',
                      title:
                        error instanceof ApiClientError
                          ? error.message
                          : t('meetingOa.refillFailed'),
                    }),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {t('meetingOa.refill')}
            </Button>
          </div>
          <p className='text-xs text-muted-foreground md:col-span-2'>
            {t('meetingOa.saveWritesZeroOa')}
          </p>
        </form>
      ) : (
        <p className='text-sm text-muted-foreground'>{t('meetings.loading')}</p>
      )}
    </section>
  );
}
