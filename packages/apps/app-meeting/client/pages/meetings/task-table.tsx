import { DatePicker } from '#components/date-picker';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Textarea } from '#components/ui/textarea';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { formatWallDate, parseWallDate } from './oa-time.js';
import { oaPersonFrom, type OaPersonChip } from './oa-person.js';
import { OaPersonMultiSelect, OaPersonSelect } from './oa-person-pickers.js';

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
    <div className='flex flex-col gap-4'>
      <div className='overflow-x-auto rounded-xl ring-1 ring-foreground/10'>
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
              <TableHead className='w-24'>
                <span className='sr-only'>{t('meetingOa.deleteTask')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task, index) => (
              <TableRow key={task.clientTaskId}>
                <TableCell className='tabular-nums'>{index + 1}</TableCell>
                <TableCell className='min-w-40'>
                  <Input
                    value={task.title}
                    disabled={disabled}
                    aria-label={t('meetingOa.fields.taskTitle')}
                    onChange={(event) =>
                      patch(task.clientTaskId, { title: event.target.value })
                    }
                  />
                </TableCell>
                <TableCell className='min-w-40'>
                  <Button
                    type='button'
                    variant='link'
                    className='h-auto max-w-56 justify-start px-0 text-left whitespace-normal'
                    onClick={() => {
                      setEditingId(task.clientTaskId);
                      setDraftContent(task.description ?? '');
                    }}
                  >
                    {task.description?.trim() || t('meetings.notProvided')}
                  </Button>
                </TableCell>
                <TableCell className='min-w-52'>
                  <OaPersonSelect
                    id={`task-assignee-${task.clientTaskId}`}
                    label={t('meetingOa.fields.assignee')}
                    disabled={disabled}
                    value={oaPersonFrom(
                      task.assigneeEmployeeNo,
                      task.assigneeName,
                    )}
                    onSearch={onSearch}
                    onChange={(person) =>
                      patch(task.clientTaskId, {
                        assigneeEmployeeNo: person?.fd_no ?? null,
                        assigneeName: person?.fd_name ?? null,
                      })
                    }
                  />
                </TableCell>
                <TableCell className='min-w-44'>
                  <DatePicker
                    id={`task-due-${task.clientTaskId}`}
                    value={parseWallDate(task.dueAt ?? '')}
                    disabled={disabled}
                    clearable={!disabled}
                    onChange={(date) =>
                      patch(task.clientTaskId, {
                        dueAt: formatWallDate(date) || null,
                      })
                    }
                  />
                </TableCell>
                <TableCell className='min-w-52'>
                  <OaPersonSelect
                    id={`task-appoint-${task.clientTaskId}`}
                    label={t('meetingOa.fields.appoint')}
                    disabled={disabled}
                    value={oaPersonFrom(
                      task.appointEmployeeNo,
                      task.appointName,
                    )}
                    onSearch={onSearch}
                    onChange={(person) =>
                      patch(task.clientTaskId, {
                        appointEmployeeNo: person?.fd_no ?? null,
                        appointName: person?.fd_name ?? null,
                      })
                    }
                  />
                </TableCell>
                <TableCell className='min-w-52'>
                  <OaPersonMultiSelect
                    id={`task-attention-${task.clientTaskId}`}
                    label={t('meetingOa.fields.attention')}
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
                </TableCell>
                <TableCell>
                  {disabled ? null : (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('meetingOa.deleteTask')}
                      onClick={() =>
                        onChange(
                          tasks.filter(
                            (row) => row.clientTaskId !== task.clientTaskId,
                          ),
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <FieldGroup className='max-w-xl'>
        <Field>
          <FieldLabel htmlFor='oa-task'>
            {t('meetingOa.fields.taskTitle')}
          </FieldLabel>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Input
              id='oa-task'
              value={taskTitle}
              disabled={disabled || busy}
              onChange={(event) => onTaskTitle(event.target.value)}
            />
            <Button type='button' disabled={disabled || busy} onClick={onAdd}>
              <PlusIcon />
              {t('meetingOa.addTask')}
            </Button>
          </div>
        </Field>
      </FieldGroup>
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
