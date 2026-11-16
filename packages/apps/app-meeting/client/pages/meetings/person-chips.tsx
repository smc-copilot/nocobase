import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

export interface OaPersonChip {
  fd_no: string;
  fd_name: string;
  fd_department: string;
}

export function PersonChips({
  id,
  mode,
  value,
  disabled,
  onChange,
  onSearch,
}: {
  readonly id: string;
  readonly mode: 'single' | 'multi';
  readonly value: readonly OaPersonChip[];
  readonly disabled?: boolean;
  readonly onChange: (next: OaPersonChip[]) => void;
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
}): ReactElement {
  const { t } = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OaPersonChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generationRef = useRef(0);
  const selected = new Set(value.map((row) => row.fd_no));
  const singleLocked = mode === 'single' && value.length > 0;
  const trimmed = query.trim();
  const canSearch = !disabled && !singleLocked && trimmed.length >= 2;

  useEffect(() => {
    if (!canSearch) return;
    const current = generationRef.current + 1;
    generationRef.current = current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void onSearch(trimmed)
        .then((rows) => {
          if (current !== generationRef.current) return;
          setResults(rows.filter((row) => row.fd_no.trim()));
          setError(false);
        })
        .catch(() => {
          if (current !== generationRef.current) return;
          setError(true);
          setResults([]);
        })
        .finally(() => {
          if (current === generationRef.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [canSearch, onSearch, trimmed]);

  const add = (person: OaPersonChip) => {
    if (!person.fd_no.trim() || selected.has(person.fd_no)) return;
    onChange(mode === 'single' ? [person] : [...value, person]);
    setQuery('');
    setResults([]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const shownResults = canSearch ? results : [];

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap gap-1'>
        {value.map((person) => (
          <Badge
            key={person.fd_no}
            variant='secondary'
            title={`${person.fd_department} / ${person.fd_no}`}
          >
            {person.fd_name}
            {disabled ? null : (
              <button
                type='button'
                className='ml-1'
                aria-label={t('meetingOa.clearPerson')}
                onClick={() =>
                  onChange(value.filter((row) => row.fd_no !== person.fd_no))
                }
              >
                ×
              </button>
            )}
          </Badge>
        ))}
      </div>
      <Input
        id={id}
        value={query}
        disabled={disabled || singleLocked}
        autoComplete='off'
        aria-controls={listId}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {singleLocked ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={disabled}
          onClick={() => onChange([])}
        >
          {t('meetingOa.clearPerson')}
        </Button>
      ) : null}
      {canSearch && loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.peopleLoading')}
        </p>
      ) : null}
      {canSearch && error ? (
        <p className='text-sm text-destructive'>
          {t('meetingOa.peopleErrorKept')}
        </p>
      ) : null}
      {!disabled &&
      !singleLocked &&
      trimmed.length > 0 &&
      trimmed.length < 2 ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.peopleNeedChars')}
        </p>
      ) : null}
      {canSearch && !loading && !error && shownResults.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('meetingOa.peopleEmpty')}
        </p>
      ) : null}
      <ul id={listId} className='flex flex-col gap-1'>
        {shownResults.map((person) => (
          <li key={person.fd_no}>
            <button
              type='button'
              className='w-full rounded border px-2 py-1 text-left text-sm'
              disabled={disabled || selected.has(person.fd_no)}
              onClick={() => add(person)}
            >
              {person.fd_name} ({person.fd_no}) {person.fd_department}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
