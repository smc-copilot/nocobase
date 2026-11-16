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
import { Button } from '#components/ui/button';
import { useTranslation } from '@nocobase/i18n/client';
import { XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { isOaPeopleUnconfigured } from './oa-people-source.js';
import {
  oaPersonLabel,
  uniqueOaPeople,
  type OaPersonChip,
} from './oa-person.js';

function useOaPersonQuery(
  query: string,
  disabled: boolean | undefined,
  onSearch: (query: string) => Promise<OaPersonChip[]>,
): {
  shownResults: OaPersonChip[];
  emptyText: string;
  waiting: boolean;
  failed: 'failed' | 'unconfigured' | false;
} {
  const { t } = useTranslation();
  const [results, setResults] = useState<OaPersonChip[]>([]);
  const [resultsFor, setResultsFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'failed' | 'unconfigured' | false>(false);
  const generationRef = useRef(0);
  const trimmed = query.trim();
  const canSearch = !disabled && trimmed.length >= 2;

  useEffect(() => {
    if (!canSearch) return;
    const current = generationRef.current + 1;
    generationRef.current = current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.resolve(onSearch(trimmed))
        .then((rows) => {
          if (current !== generationRef.current) return;
          setResults(uniqueOaPeople(rows));
          setResultsFor(trimmed);
          setError(false);
        })
        .catch((caught: unknown) => {
          if (current !== generationRef.current) return;
          setResults([]);
          setResultsFor(trimmed);
          setError(isOaPeopleUnconfigured(caught) ? 'unconfigured' : 'failed');
        })
        .finally(() => {
          if (current === generationRef.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [canSearch, onSearch, trimmed]);

  const shownResults = useMemo(
    () => (canSearch && resultsFor === trimmed ? results : []),
    [canSearch, results, resultsFor, trimmed],
  );
  const waiting = canSearch && (loading || resultsFor !== trimmed);
  const failed = error && resultsFor === trimmed && !waiting ? error : false;
  const emptyText =
    failed === 'unconfigured'
      ? t('meetingOa.peopleNotConfigured')
      : failed === 'failed'
        ? t('meetingOa.peopleErrorKept')
        : waiting
          ? t('meetingOa.peopleLoading')
          : trimmed.length > 0 && trimmed.length < 2
            ? t('meetingOa.peopleNeedChars')
            : t('meetingOa.peopleEmpty');
  return { shownResults, emptyText, waiting, failed };
}

function OaPersonCombobox({
  id,
  label,
  multiple,
  disabled,
  selected,
  onSearch,
  onChange,
}: {
  readonly id: string;
  readonly label?: string;
  readonly multiple: boolean;
  readonly disabled?: boolean;
  readonly selected: readonly OaPersonChip[];
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
  readonly onChange: (next: OaPersonChip[]) => void;
}): ReactElement {
  const { t } = useTranslation();
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState('');
  const { shownResults, emptyText, waiting, failed } = useOaPersonQuery(
    query,
    disabled,
    onSearch,
  );
  const peopleByNo = useMemo(() => {
    const next = new Map<string, OaPersonChip>();
    for (const person of selected) next.set(person.fd_no, person);
    for (const person of shownResults) next.set(person.fd_no, person);
    return next;
  }, [selected, shownResults]);
  const selectedIds = selected.map((person) => person.fd_no);
  const selectedSet = new Set(selectedIds);
  const items = shownResults
    .map((person) => person.fd_no)
    .filter((id) => !selectedSet.has(id));
  const labelOf = (item: string): string => {
    const person = peopleByNo.get(item);
    return person ? oaPersonLabel(person) : item;
  };
  const apply = (nextIds: readonly string[]) => {
    onChange(
      uniqueOaPeople(
        nextIds
          .map((item) => peopleByNo.get(item))
          .filter((person): person is OaPersonChip => Boolean(person)),
      ),
    );
    setQuery('');
  };

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-start gap-1'>
        <div className='min-w-0 flex-1'>
          <Combobox
            autoHighlight
            filter={null}
            multiple={multiple}
            items={items}
            value={multiple ? selectedIds : (selectedIds[0] ?? null)}
            disabled={disabled}
            itemToStringLabel={labelOf}
            inputValue={query}
            onInputValueChange={(next, details) => {
              if (
                details.reason === 'input-change' ||
                details.reason === 'input-clear'
              ) {
                setQuery(next);
              }
            }}
            onValueChange={(next) => {
              const incoming = Array.isArray(next)
                ? next.map(String)
                : next
                  ? [String(next)]
                  : [];
              if (!multiple) {
                apply(incoming.slice(-1));
                return;
              }
              const selectedSet = new Set(selectedIds);
              const incomingSet = new Set(incoming);
              const added = incoming.filter((id) => !selectedSet.has(id));
              const onlyRemoved =
                added.length === 0 &&
                selectedIds.some((id) => !incomingSet.has(id));
              if (onlyRemoved) {
                apply(incoming);
                return;
              }
              apply([...selectedIds, ...added]);
            }}
          >
            <ComboboxChips ref={anchor} className='min-h-8'>
              <ComboboxValue>
                {selected.map((person) => (
                  <ComboboxChip
                    key={person.fd_no}
                    showRemove={!disabled && multiple}
                  >
                    {person.fd_name}
                  </ComboboxChip>
                ))}
              </ComboboxValue>
              <ComboboxChipsInput
                id={id}
                disabled={disabled}
                aria-label={
                  label
                    ? `${label}. ${t('meetingOa.peopleSearch')}`
                    : t('meetingOa.peopleSearch')
                }
                placeholder={
                  selected.length === 0
                    ? t('meetingOa.peopleSearch')
                    : undefined
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
        </div>
        {!multiple && selected[0] && !disabled ? (
          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            aria-label={t('meetingOa.clearPerson')}
            onClick={() => apply([])}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      {failed || waiting ? (
        <p role='status' className='text-xs text-muted-foreground'>
          {emptyText}
        </p>
      ) : null}
    </div>
  );
}

export function OaPersonSelect({
  id,
  label,
  value,
  disabled,
  onSearch,
  onChange,
}: {
  readonly id: string;
  readonly label?: string;
  readonly value: OaPersonChip | null;
  readonly disabled?: boolean;
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
  readonly onChange: (next: OaPersonChip | null) => void;
}): ReactElement {
  return (
    <OaPersonCombobox
      id={id}
      label={label}
      multiple={false}
      disabled={disabled}
      selected={value ? [value] : []}
      onSearch={onSearch}
      onChange={(next) => onChange(next[0] ?? null)}
    />
  );
}

export function OaPersonMultiSelect({
  id,
  label,
  value,
  disabled,
  onSearch,
  onChange,
}: {
  readonly id: string;
  readonly label?: string;
  readonly value: readonly OaPersonChip[];
  readonly disabled?: boolean;
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
  readonly onChange: (next: OaPersonChip[]) => void;
}): ReactElement {
  return (
    <OaPersonCombobox
      id={id}
      label={label}
      multiple
      disabled={disabled}
      selected={uniqueOaPeople(value)}
      onSearch={onSearch}
      onChange={onChange}
    />
  );
}
