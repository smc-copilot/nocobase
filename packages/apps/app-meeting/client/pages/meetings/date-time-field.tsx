import { DatePicker } from '#components/date-picker';
import { Input } from '#components/ui/input';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { formatWallDateTime, parseWallDate, parseWallTime } from './oa-time.js';

export function DateTimeField({
  id,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const date = parseWallDate(value);
  const time = parseWallTime(value);
  return (
    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
      <DatePicker
        id={id}
        value={date}
        disabled={disabled}
        clearable={!disabled}
        onChange={(next) => onChange(formatWallDateTime(next, time || '00:00'))}
      />
      <Input
        type='time'
        aria-label={t('meetingOa.fields.time')}
        className='w-full sm:w-36'
        disabled={disabled}
        value={time}
        onChange={(event) =>
          onChange(formatWallDateTime(date, event.target.value))
        }
      />
    </div>
  );
}
