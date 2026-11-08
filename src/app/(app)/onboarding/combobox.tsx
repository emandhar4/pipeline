'use client';

import { useEffect, useId, useReducer, useRef } from 'react';
import { FieldBadge, FieldError, badgeId, errorId } from './form-parts';

export type ComboOption = { id: string; label: string; detail?: string };

/** A row in the open list: a search result, or the closing "Use what I typed" row. */
export type ComboRow = { kind: 'option'; option: ComboOption } | { kind: 'free'; text: string };

export type ComboState = {
  text: string;
  /** The picked option's id; '' for free text or nothing picked. */
  id: string;
  open: boolean;
  options: ComboOption[];
  /** Index into comboRows(state); -1 when no row is highlighted. */
  active: number;
  /** Sequence number of the latest typed text; results for any other seq are stale. */
  seq: number;
  /** True once results for the latest seq have arrived. */
  settled: boolean;
  allowFreeText: boolean;
};

export type ComboAction =
  | { type: 'type'; text: string; seq: number }
  | { type: 'results'; seq: number; options: ComboOption[] }
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'pick'; option: ComboOption | null }
  | { type: 'close' };

export const MIN_CHARS = 2;
export const MAX_RESULTS = 8;
const DEBOUNCE_MS = 150;

export function initialComboState(init: {
  text: string;
  id: string;
  allowFreeText: boolean;
}): ComboState {
  return { ...init, open: false, options: [], active: -1, seq: 0, settled: false };
}

export function comboRows(state: ComboState): ComboRow[] {
  const rows: ComboRow[] = state.options.map((option) => ({ kind: 'option', option }));
  const typed = state.text.trim();
  if (state.allowFreeText && typed) rows.push({ kind: 'free', text: typed });
  return rows;
}

export function comboReducer(state: ComboState, action: ComboAction): ComboState {
  switch (action.type) {
    case 'type': {
      const short = action.text.trim().length < MIN_CHARS;
      return {
        ...state,
        text: action.text,
        id: '',
        open: true,
        active: -1,
        seq: action.seq,
        settled: short,
        options: short ? [] : state.options,
      };
    }
    case 'results': {
      if (action.seq !== state.seq) return state;
      return { ...state, options: action.options.slice(0, MAX_RESULTS), active: -1, settled: true };
    }
    case 'move': {
      const n = comboRows(state).length;
      if (n === 0) return state;
      const from = state.active < 0 ? (action.delta > 0 ? -1 : n) : state.active;
      return { ...state, open: true, active: (from + action.delta + n) % n };
    }
    case 'pick': {
      const picked = action.option
        ? { text: action.option.label, id: action.option.id }
        : { text: state.text.trim(), id: '' };
      return { ...state, ...picked, open: false, active: -1 };
    }
    case 'close':
      return state.open || state.active !== -1 ? { ...state, open: false, active: -1 } : state;
  }
}

/**
 * A type-ahead text field (ARIA 1.2 combobox with a listbox popup). The typed text is
 * submitted as `name`; when `idName` is set, the picked option's id goes in a hidden input
 * (empty for free text). `onPick` gets the option when one is picked and null when the
 * selection is replaced by typed text.
 */
export function Combobox({
  name,
  idName,
  label,
  hint,
  defaultText,
  defaultId,
  search,
  allowFreeText,
  onPick,
  error,
  badge,
}: {
  name: string;
  idName?: string;
  label: string;
  hint?: string;
  defaultText: string;
  defaultId: string;
  search: (q: string) => Promise<ComboOption[]>;
  allowFreeText: boolean;
  onPick?: (opt: ComboOption | null) => void;
  error?: string;
  badge?: string;
}) {
  const [state, dispatch] = useReducer(
    comboReducer,
    { text: defaultText, id: defaultId, allowFreeText },
    initialComboState,
  );
  const listId = useId();
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const rows = comboRows(state);
  const showList = state.open && rows.length > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  function onType(text: string) {
    const mine = ++seq.current;
    if (state.id) onPick?.(null);
    dispatch({ type: 'type', text, seq: mine });
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const q = text.trim();
    if (q.length < MIN_CHARS) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      search(q).then(
        (options) => {
          if (mounted.current) dispatch({ type: 'results', seq: mine, options });
        },
        () => {
          if (mounted.current) dispatch({ type: 'results', seq: mine, options: [] });
        },
      );
    }, DEBOUNCE_MS);
  }

  function pick(row: ComboRow) {
    const option = row.kind === 'option' ? row.option : null;
    dispatch({ type: 'pick', option });
    onPick?.(option);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (rows.length === 0) return;
      e.preventDefault();
      dispatch({ type: 'move', delta: e.key === 'ArrowDown' ? 1 : -1 });
    } else if (e.key === 'Enter') {
      // Only swallow Enter when it picks a row; otherwise it submits the form as usual.
      if (!showList || state.active < 0) return;
      e.preventDefault();
      pick(rows[state.active]);
    } else if (e.key === 'Escape') {
      if (!state.open) return;
      e.preventDefault();
      dispatch({ type: 'close' });
    }
  }

  const describedBy = [
    badge ? badgeId(name) : null,
    hint ? `${name}-hint` : null,
    error ? errorId(name) : null,
  ]
    .filter(Boolean)
    .join(' ');
  const status =
    state.open && state.settled && state.text.trim().length >= MIN_CHARS
      ? state.options.length === 0
        ? 'No matches'
        : `${state.options.length} ${state.options.length === 1 ? 'match' : 'matches'}`
      : '';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <FieldBadge name={name}>{badge}</FieldBadge>
      </div>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          className="field w-full"
          value={state.text}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && state.active >= 0 ? optionId(state.active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => dispatch({ type: 'close' })}
        />
        {idName ? <input type="hidden" name={idName} value={state.id} /> : null}
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!showList}
          className="combo-list"
        >
          {rows.map((row, i) => (
            <li
              key={row.kind === 'option' ? `o-${row.option.id}` : 'free'}
              id={optionId(i)}
              role="option"
              aria-selected={i === state.active}
              data-kind={row.kind}
              className="combo-option"
              // Keep focus in the input so blur does not close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(row)}
            >
              {row.kind === 'option' ? (
                <>
                  <span className="min-w-0 truncate">{row.option.label}</span>
                  {row.option.detail ? (
                    <span className="combo-detail">{row.option.detail}</span>
                  ) : null}
                </>
              ) : (
                <span className="min-w-0 truncate">
                  Use &quot;<span className="text-foreground">{row.text}</span>&quot;
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {hint ? (
        <p id={`${name}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      <FieldError name={name} error={error} />
    </div>
  );
}
