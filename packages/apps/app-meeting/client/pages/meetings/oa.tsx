import {
  ApiClientError,
  createUuid,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { useListData } from '#hooks/use-list-data';

interface Identity {
  userId: string;
  employeeNo: string | null;
  canSync: boolean;
  denyReason: string | null;
}

interface DraftTask {
  clientTaskId: string;
  title: string;
  assigneeEmployeeNo: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  description: string | null;
  fromSourceTodo: boolean;
}

interface Draft {
  meetingId: string;
  version: number;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  summary: string | null;
  tasks: DraftTask[];
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
  const [summary, setSummary] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [people, setPeople] = useState<
    { fd_no: string; fd_name: string; fd_department: string }[]
  >([]);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  const shownTitle = title ?? draft?.title ?? '';
  const shownSummary = summary ?? draft?.summary ?? '';
  const currentVersion = savedVersion ?? draft?.version;
  const isolation = useMemo(() => t('meetingOa.isolationBanner'), [t]);

  const persistDraft = async (
    tasks = draft?.tasks ?? [],
  ): Promise<Draft | undefined> => {
    if (!draft || currentVersion == null) return undefined;
    const result = await api.request<{ data: Draft }>({
      path: `meetings/${meetingId}/oa-draft`,
      method: 'PUT',
      json: {
        expectedVersion: currentVersion,
        title: shownTitle,
        summary: shownSummary,
        tasks,
      },
    });
    setSavedVersion(result.data.version);
    void draftRequest.reload();
    return result.data;
  };

  const save = async (tasks = draft?.tasks ?? []) => {
    if (!draft) return;
    setBusy(true);
    try {
      await persistDraft(tasks);
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
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await persistDraft();
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
      setBusy(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          title={t('meetingOa.workspaceTitle')}
          description={t('meetingOa.workspaceDescription')}
        />
        <Alert>
          <AlertDescription>
            {draft?.isolationAdapter
              ? isolation
              : t('meetingOa.liveWriteBlocked')}
          </AlertDescription>
        </Alert>
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
        {draftRequest.error ? (
          <Alert variant='destructive'>
            <AlertDescription>{t('meetings.unavailable')}</AlertDescription>
          </Alert>
        ) : null}
        {draft ? (
          <form
            className='flex max-w-xl flex-col gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className='flex flex-col gap-1'>
              <Label htmlFor='oa-title'>{t('meetingOa.fields.title')}</Label>
              <Input
                id='oa-title'
                value={shownTitle}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='oa-summary'>
                {t('meetingOa.fields.summary')}
              </Label>
              <Textarea
                id='oa-summary'
                value={shownSummary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='oa-people'>{t('meetingOa.peopleSearch')}</Label>
              <div className='flex gap-2'>
                <Input
                  id='oa-people'
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                />
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    void api
                      .request<{
                        data: {
                          fd_no: string;
                          fd_name: string;
                          fd_department: string;
                        }[];
                      }>({
                        path: 'meetingOa/people',
                        query: { q: peopleQuery },
                      })
                      .then((result) => setPeople(result.data))
                      .catch((error: unknown) =>
                        toaster.show({
                          type: 'error',
                          title:
                            error instanceof ApiClientError
                              ? error.message
                              : t('meetingOa.peopleFailed'),
                        }),
                      );
                  }}
                >
                  {t('meetingOa.search')}
                </Button>
              </div>
              {people.map((person) => (
                <button
                  key={person.fd_no}
                  type='button'
                  className='rounded border px-2 py-1 text-left text-sm'
                  onClick={() => setTaskAssignee(person.fd_no)}
                >
                  {person.fd_name} ({person.fd_no}) {person.fd_department}
                </button>
              ))}
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='oa-task'>{t('meetingOa.fields.taskTitle')}</Label>
              <Input
                id='oa-task'
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <Label htmlFor='oa-assignee'>
                {t('meetingOa.fields.assignee')}
              </Label>
              <Input
                id='oa-assignee'
                value={taskAssignee}
                onChange={(event) => setTaskAssignee(event.target.value)}
              />
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  if (!taskTitle.trim()) return;
                  void save([
                    ...(draft.tasks ?? []),
                    {
                      clientTaskId: createUuid(),
                      title: taskTitle.trim(),
                      assigneeEmployeeNo: taskAssignee.trim() || null,
                      assigneeName: null,
                      dueAt: null,
                      description: null,
                      fromSourceTodo: false,
                    },
                  ]);
                  setTaskTitle('');
                }}
              >
                {t('meetingOa.addTask')}
              </Button>
            </div>
            <ul className='text-sm'>
              {(draft.tasks ?? []).map((task) => (
                <li key={task.clientTaskId}>
                  {task.title} ·{' '}
                  {task.assigneeEmployeeNo ?? t('meetings.notProvided')}
                </li>
              ))}
            </ul>
            <div className='flex gap-2'>
              <Button type='submit' disabled={busy}>
                {t('meetingOa.saveDraft')}
              </Button>
              <Button
                type='button'
                variant='secondary'
                disabled={busy || !identityRow?.canSync}
                onClick={() => void sync()}
              >
                {t('meetingOa.submitSync')}
              </Button>
            </div>
            <p className='text-xs text-muted-foreground'>
              {t('meetingOa.saveWritesZeroOa')}
            </p>
          </form>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('meetings.loading')}
          </p>
        )}
        <p className='text-sm'>
          <Link to={`/meetings/${meetingId}`}>
            {t('meetings.tabs.overview')}
          </Link>
        </p>
      </PageContainer>
    </RouteChildPage>
  );
}
