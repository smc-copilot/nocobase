import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '#components/ui/combobox';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

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
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OaPersonChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generationRef = useRef(0);
  const trimmed = query.trim();
  const canSearch = !disabled && trimmed.length >= 2;

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

  const peopleByNo = useMemo(() => {
    const next = new Map<string, OaPersonChip>();
    for (const person of value) next.set(person.fd_no, person);
    if (canSearch) {
      for (const person of results) next.set(person.fd_no, person);
    }
    return next;
  }, [canSearch, results, value]);
  const items = [...peopleByNo.keys()];
  const selected = value.map((person) => person.fd_no);
  const labelOf = (item: string): string => {
    const person = peopleByNo.get(item);
    if (!person) return item;
    return person.fd_department
      ? `${person.fd_name} (${person.fd_no}) ${person.fd_department}`
      : `${person.fd_name} (${person.fd_no})`;
  };
  const emptyText = error
    ? t('meetingOa.peopleErrorKept')
    : canSearch && loading
      ? t('meetingOa.peopleLoading')
      : trimmed.length > 0 && trimmed.length < 2
        ? t('meetingOa.peopleNeedChars')
        : t('meetingOa.peopleEmpty');

  const apply = (nextIds: readonly string[]) => {
    const next = nextIds
      .map((id) => peopleByNo.get(id))
      .filter((person): person is OaPersonChip =>
        Boolean(person?.fd_no.trim()),
      );
    onChange(mode === 'single' ? next.slice(0, 1) : next);
    setQuery('');
  };

  return (
    <Combobox
      autoHighlight
      multiple={mode === 'multi'}
      items={items}
      value={mode === 'multi' ? selected : (selected[0] ?? null)}
      disabled={disabled}
      itemToStringLabel={labelOf}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        if (mode === 'multi') {
          apply(Array.isArray(next) ? next : []);
          return;
        }
        apply(next ? [String(next)] : []);
      }}
    >
      <ComboboxChips ref={anchor} className='min-h-8'>
        <ComboboxValue>
          {value.map((person) => (
            <ComboboxChip key={person.fd_no} showRemove={!disabled}>
              {person.fd_name}
            </ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          disabled={disabled}
          aria-label={t('meetingOa.peopleSearch')}
          placeholder={
            value.length === 0 ? t('meetingOa.peopleSearch') : undefined
          }
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {labelOf(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
