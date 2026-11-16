import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { PersonChips, type OaPersonChip } from './person-chips.js';

export interface DraftTaskRow {
  clientTaskId: string;
  title: string;
  assigneeEmployeeNo: string | null;
  assigneeName: string | null;
  appointEmployeeNo: string | null;
  appointName: string | null;
  attentionEmployeeNos: readonly string[];
  attentionSnapshots: readonly OaPersonChip[];
  startAt: string | null;
  dueAt: string | null;
  description: string | null;
  fromSourceTodo: boolean;
}

function personFrom(
  no: string | null,
  name: string | null,
): OaPersonChip | null {
  if (!no) return null;
  return { fd_no: no, fd_name: name || no, fd_department: '' };
}

export function TaskTable({
  tasks,
  disabled,
  busy,
  taskTitle,
  onTaskTitle,
  onAdd,
  onChange,
  onSearch,
}: {
  readonly tasks: readonly DraftTaskRow[];
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly taskTitle: string;
  readonly onTaskTitle: (value: string) => void;
  readonly onAdd: () => void;
  readonly onChange: (next: DraftTaskRow[]) => void;
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
}): ReactElement {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const editing = tasks.find((task) => task.clientTaskId === editingId);

  const patch = (clientTaskId: string, next: Partial<DraftTaskRow>) => {
    onChange(
      tasks.map((task) =>
        task.clientTaskId === clientTaskId ? { ...task, ...next } : task,
      ),
    );
  };

  return (
    <div className='flex flex-col gap-3'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('meetingOa.fields.taskIndex')}</TableHead>
            <TableHead>{t('meetingOa.fields.taskTitle')}</TableHead>
            <TableHead>{t('meetingOa.fields.taskContent')}</TableHead>
            <TableHead>{t('meetingOa.fields.assignee')}</TableHead>
            <TableHead>{t('meetingOa.fields.dueAt')}</TableHead>
            <TableHead>{t('meetingOa.fields.appoint')}</TableHead>
            <TableHead>{t('meetingOa.fields.attention')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task, index) => (
            <TableRow key={task.clientTaskId}>
              <TableCell>{index + 1}</TableCell>
              <TableCell className='min-w-40'>
                <Input
                  value={task.title}
                  disabled={disabled}
                  className='max-h-20 whitespace-pre-wrap'
                  onChange={(event) =>
                    patch(task.clientTaskId, { title: event.target.value })
                  }
                />
              </TableCell>
              <TableCell className='min-w-40'>
                <button
                  type='button'
                  className='line-clamp-3 max-w-48 text-left text-sm underline'
                  onClick={() => {
                    setEditingId(task.clientTaskId);
                    setDraftContent(task.description ?? '');
                  }}
                >
                  {task.description?.trim() || t('meetings.notProvided')}
                </button>
              </TableCell>
              <TableCell className='min-w-48'>
                <PersonChips
                  id={`task-assignee-${task.clientTaskId}`}
                  mode='single'
                  disabled={disabled}
                  value={
                    personFrom(task.assigneeEmployeeNo, task.assigneeName)
                      ? [
                          personFrom(
                            task.assigneeEmployeeNo,
                            task.assigneeName,
                          ) as OaPersonChip,
                        ]
                      : []
                  }
                  onSearch={onSearch}
                  onChange={(people) => {
                    const person = people[0];
                    patch(task.clientTaskId, {
                      assigneeEmployeeNo: person?.fd_no ?? null,
                      assigneeName: person?.fd_name ?? null,
                    });
                  }}
                />
              </TableCell>
              <TableCell>
                <Input
                  type='date'
                  disabled={disabled}
                  value={task.dueAt?.slice(0, 10) ?? ''}
                  onChange={(event) =>
                    patch(task.clientTaskId, {
                      dueAt: event.target.value || null,
                    })
                  }
                />
              </TableCell>
              <TableCell className='min-w-48'>
                <PersonChips
                  id={`task-appoint-${task.clientTaskId}`}
                  mode='single'
                  disabled={disabled}
                  value={
                    personFrom(task.appointEmployeeNo, task.appointName)
                      ? [
                          personFrom(
                            task.appointEmployeeNo,
                            task.appointName,
                          ) as OaPersonChip,
                        ]
                      : []
                  }
                  onSearch={onSearch}
                  onChange={(people) => {
                    const person = people[0];
                    patch(task.clientTaskId, {
                      appointEmployeeNo: person?.fd_no ?? null,
                      appointName: person?.fd_name ?? null,
                    });
                  }}
                />
              </TableCell>
              <TableCell className='min-w-48'>
                <PersonChips
                  id={`task-attention-${task.clientTaskId}`}
                  mode='multi'
                  disabled={disabled}
                  value={[...task.attentionSnapshots]}
                  onSearch={onSearch}
                  onChange={(people) =>
                    patch(task.clientTaskId, {
                      attentionSnapshots: people,
                      attentionEmployeeNos: people.map((row) => row.fd_no),
                    })
                  }
                />
                {disabled ? null : (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      onChange(
                        tasks.filter(
                          (row) => row.clientTaskId !== task.clientTaskId,
                        ),
                      )
                    }
                  >
                    {t('meetingOa.deleteTask')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='oa-task'>{t('meetingOa.fields.taskTitle')}</Label>
        <Input
          id='oa-task'
          value={taskTitle}
          disabled={disabled || busy}
          onChange={(event) => onTaskTitle(event.target.value)}
        />
        <Button
          type='button'
          variant='outline'
          disabled={disabled || busy}
          onClick={onAdd}
        >
          {t('meetingOa.addTask')}
        </Button>
      </div>
      <Dialog
        open={editingId != null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('meetingOa.taskDialogTitle')}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftContent}
            readOnly={disabled}
            onChange={(event) => setDraftContent(event.target.value)}
          />
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setEditingId(null)}
            >
              {t('meetingOa.taskDialogCancel')}
            </Button>
            {disabled ? null : (
              <Button
                type='button'
                onClick={() => {
                  if (editing) {
                    patch(editing.clientTaskId, { description: draftContent });
                  }
                  setEditingId(null);
                }}
              >
                {t('meetingOa.taskDialogSave')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
