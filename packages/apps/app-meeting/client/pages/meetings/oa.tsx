import {
  ApiClientError,
  createUuid,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RecordLink } from '#components/record-link';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '#components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { useListData } from '#hooks/use-list-data';
import { DateTimeField } from './date-time-field.js';
import { MeetingLoading, MeetingUnavailable } from './meeting-feedback.js';
import { createOaPeopleSearch } from './oa-people-source.js';
import { type OaPersonChip } from './oa-person.js';
import { OaPersonMultiSelect, OaPersonSelect } from './oa-person-pickers.js';
import { beijingWallToIso, isoToBeijingInput } from './oa-time.js';
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
  const [emcee, setEmcee] = useState<OaPersonChip | null | undefined>(
    undefined,
  );
  const [host, setHost] = useState<OaPersonChip | null | undefined>(undefined);
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
    emcee === undefined ? (draft?.emceeSnapshot ?? creatorPerson) : emcee;
  const shownHost =
    host === undefined ? (draft?.hostSnapshot ?? creatorPerson) : host;
  const shownActual = actualAttend ?? [...(draft?.actualAttendSnapshots ?? [])];
  const shownCopyTo = copyTo ?? [...(draft?.copyToSnapshots ?? [])];
  const shownTasks = tasks ?? asTasks(draft?.tasks);
  const currentVersion = savedVersion ?? draft?.version;
  const frozen = Boolean(draft?.frozen);
  const isolation = useMemo(() => t('meetingOa.isolationBanner'), [t]);

  const searchPeople = useMemo(() => createOaPeopleSearch(api), [api]);

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
        emceeSnapshot: shownEmcee,
        hostSnapshot: shownHost,
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
    return <MeetingUnavailable onRetry={() => draftRequest.reload()} />;
  }

  return (
    <div className='flex flex-col gap-6'>
      <Alert>
        <AlertDescription>
          {draft?.isolationAdapter
            ? isolation
            : t('meetingOa.liveWriteBlocked')}
        </AlertDescription>
      </Alert>
      {identityRow ? (
        <Alert variant={identityRow.canSync ? 'default' : 'destructive'}>
          <AlertDescription>
            {identityRow.canSync
              ? t('meetingOa.mappedAs', { employeeNo: identityRow.employeeNo })
              : t('meetingOa.mappingMissing')}
          </AlertDescription>
        </Alert>
      ) : null}
      {content?.lastImportError === 'IMPORT_CONTRACT_UNAVAILABLE' ? (
        <Alert>
          <AlertDescription>
            {t('meetingOa.importContractMissing')}
          </AlertDescription>
        </Alert>
      ) : content?.lastImportError ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('meetingOa.importFailed')}</AlertDescription>
        </Alert>
      ) : null}
      {content?.localMinutesEdited ? (
        <Alert>
          <AlertDescription>{t('meetingOa.localMinutesKept')}</AlertDescription>
        </Alert>
      ) : null}
      {frozen ? (
        <Alert>
          <AlertDescription>{t('meetingOa.draftFrozen')}</AlertDescription>
        </Alert>
      ) : null}
      {frozen && draft?.operationId ? (
        <p>
          <RecordLink to={`/meeting-operations/${draft.operationId}`}>
            {t('meetingOa.viewOperation')}
          </RecordLink>
        </p>
      ) : null}
      {content?.sourceTodos?.length ? (
        <Card>
          <CardHeader>
            <h2 className='font-heading text-base font-medium'>
              {t('meetingOa.sourceTodos')}
            </h2>
            <CardDescription>
              {t('meetingOa.sourceTodosNotAssigned')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='list-disc pl-5 text-sm'>
              {content.sourceTodos.map((todo) => (
                <li key={todo.title}>{todo.title}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <SupplementalFilesPanel meetingId={meetingId} frozen={frozen} />
      {draft ? (
        <form
          className='flex flex-col gap-6'
          onSubmit={(event) => {
            event.preventDefault();
            if (!frozen) void save();
          }}
        >
          <Card>
            <CardHeader>
              <h2 className='font-heading text-base font-medium'>
                {t('meetingOa.workspaceTitle')}
              </h2>
              <CardDescription>
                {t('meetingOa.workspaceDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
                  <Field className='md:col-span-2'>
                    <FieldDescription>
                      {t('meetingOa.beijingHint')}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-title'>
                      {t('meetingOa.fields.title')}
                    </FieldLabel>
                    <Input
                      id='oa-title'
                      value={shownTitle}
                      disabled={frozen}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-purpose'>
                      {t('meetingOa.fields.purpose')}
                    </FieldLabel>
                    <Input
                      id='oa-purpose'
                      value={shownPurpose}
                      disabled={frozen}
                      onChange={(event) => setPurpose(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-location'>
                      {t('meetingOa.fields.location')}
                    </FieldLabel>
                    <Input
                      id='oa-location'
                      value={shownLocation}
                      disabled={frozen}
                      onChange={(event) => setLocation(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-start'>
                      {t('meetingOa.fields.startAt')}
                    </FieldLabel>
                    <DateTimeField
                      id='oa-start'
                      value={shownStart}
                      disabled={frozen}
                      onChange={setStartAt}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-end'>
                      {t('meetingOa.fields.endAt')}
                    </FieldLabel>
                    <DateTimeField
                      id='oa-end'
                      value={shownEnd}
                      disabled={frozen}
                      onChange={setEndAt}
                    />
                  </Field>
                  <Field className='md:col-span-2'>
                    <FieldDescription>
                      {draft?.isolationAdapter
                        ? t('meetingOa.peopleSourceTest')
                        : t('meetingOa.peopleSourceHttp')}
                    </FieldDescription>
                  </Field>
                  <Field className='md:col-span-2'>
                    <FieldLabel htmlFor='oa-attendees'>
                      {t('meetingOa.fields.attendees')}
                    </FieldLabel>
                    <OaPersonMultiSelect
                      id='oa-attendees'
                      label={t('meetingOa.fields.attendees')}
                      value={shownAttendees}
                      disabled={frozen}
                      onSearch={searchPeople}
                      onChange={setAttendees}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-emcee'>
                      {t('meetingOa.fields.emcee')}
                    </FieldLabel>
                    <OaPersonSelect
                      id='oa-emcee'
                      label={t('meetingOa.fields.emcee')}
                      value={shownEmcee}
                      disabled={frozen}
                      onSearch={searchPeople}
                      onChange={setEmcee}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-host'>
                      {t('meetingOa.fields.host')}
                    </FieldLabel>
                    <OaPersonSelect
                      id='oa-host'
                      label={t('meetingOa.fields.host')}
                      value={shownHost}
                      disabled={frozen}
                      onSearch={searchPeople}
                      onChange={setHost}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-other'>
                      {t('meetingOa.fields.otherAttendPerson')}
                    </FieldLabel>
                    <Input
                      id='oa-other'
                      value={shownOther}
                      disabled={frozen}
                      onChange={(event) =>
                        setOtherAttendPerson(event.target.value)
                      }
                    />
                  </Field>
                  <Field className='md:col-span-2'>
                    <FieldLabel htmlFor='oa-remark'>
                      {t('meetingOa.fields.remark')}
                    </FieldLabel>
                    <Textarea
                      id='oa-remark'
                      value={shownRemark}
                      disabled={frozen}
                      onChange={(event) => setRemark(event.target.value)}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className='font-heading text-base font-medium'>
                {t('meetingOa.fields.summary')}
              </h2>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
                  <Field>
                    <FieldLabel htmlFor='oa-summary-title'>
                      {t('meetingOa.fields.summaryTitle')}
                    </FieldLabel>
                    <Input
                      id='oa-summary-title'
                      value={shownSummaryTitle}
                      disabled={frozen}
                      onChange={(event) => setSummaryTitle(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-complete'>
                      {t('meetingOa.fields.summaryCompleteTime')}
                    </FieldLabel>
                    <DateTimeField
                      id='oa-complete'
                      value={shownComplete}
                      disabled={frozen}
                      onChange={setSummaryCompleteTime}
                    />
                  </Field>
                  <Field className='md:col-span-2'>
                    <FieldLabel htmlFor='oa-summary'>
                      {t('meetingOa.fields.summary')}
                    </FieldLabel>
                    <Textarea
                      id='oa-summary'
                      value={shownSummary}
                      disabled={frozen}
                      onChange={(event) => setSummary(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t('meetingOa.fields.inputPerson')}</FieldLabel>
                    <p className='text-sm'>
                      {identityRow?.employeeNo ?? t('meetings.notProvided')}
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='oa-actual'>
                      {t('meetingOa.fields.actualAttend')}
                    </FieldLabel>
                    <OaPersonMultiSelect
                      id='oa-actual'
                      label={t('meetingOa.fields.actualAttend')}
                      value={shownActual}
                      disabled={frozen}
                      onSearch={searchPeople}
                      onChange={setActualAttend}
                    />
                  </Field>
                  <Field className='md:col-span-2'>
                    <FieldLabel htmlFor='oa-copy'>
                      {t('meetingOa.fields.copyTo')}
                    </FieldLabel>
                    <OaPersonMultiSelect
                      id='oa-copy'
                      label={t('meetingOa.fields.copyTo')}
                      value={shownCopyTo}
                      disabled={frozen}
                      onSearch={searchPeople}
                      onChange={setCopyTo}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className='font-heading text-base font-medium'>
                {t('meetingOa.fields.tasks')}
              </h2>
            </CardHeader>
            <CardContent>
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
                  if (busy || persistLockRef.current || !taskTitle.trim())
                    return;
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
            </CardContent>
            <CardFooter className='flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
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
              <p className='text-xs text-muted-foreground sm:ml-auto'>
                {t('meetingOa.saveWritesZeroOa')}
              </p>
            </CardFooter>
          </Card>
        </form>
      ) : (
        <MeetingLoading />
      )}
    </div>
  );
}
