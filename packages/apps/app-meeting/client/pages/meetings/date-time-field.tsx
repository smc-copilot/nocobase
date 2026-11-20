import { Input } from '#components/ui/input';
import { type ReactElement } from 'react';

/** One Beijing wall-clock control: `yyyy-MM-ddTHH:mm` for `datetime-local`. */
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
  return (
    <Input
      id={id}
      type='datetime-local'
      step={60}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
