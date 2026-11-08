'use client';

import { useState } from 'react';
import {
  AREAS,
  COUNTRIES,
  US_STATES,
  countryName,
  isUsState,
  toggleStates,
  type UsState,
} from '@/lib/onboarding/regions';
import { Combobox, MAX_RESULTS, type ComboOption } from './combobox';
import { FieldError, errorId } from './form-parts';

type Toggle = { key: string; label: string; states: UsState[] };

const ALL_STATES: UsState[] = US_STATES.map((s) => s.code);

/** pressed when every state in the group is picked, mixed when some are. */
function pressedFor(selected: Set<UsState>, group: UsState[]): 'true' | 'false' | 'mixed' {
  const n = group.filter((s) => selected.has(s)).length;
  return n === group.length ? 'true' : n === 0 ? 'false' : 'mixed';
}

const CHIP_STATE = { true: 'primary', mixed: 'secondary', false: 'off' } as const;

function summary(anywhere: boolean, count: number): string {
  if (anywhere) return 'Anywhere in the US';
  if (count === 0) return 'None yet';
  return `${count} ${count === 1 ? 'state' : 'states'} selected`;
}

function searchCountries(picked: string[]) {
  return async (q: string): Promise<ComboOption[]> => {
    const needle = q.trim().toLowerCase();
    const taken = new Set(picked);
    const hits = COUNTRIES.filter((c) => !taken.has(c))
      .map((c) => ({ id: c, label: countryName(c) }))
      .filter((o) => o.label.toLowerCase().includes(needle));
    // Names that start with the text come first, then the rest, each alphabetical.
    hits.sort(
      (a, b) =>
        Number(!a.label.toLowerCase().startsWith(needle)) -
          Number(!b.label.toLowerCase().startsWith(needle)) || a.label.localeCompare(b.label),
    );
    return hits.slice(0, MAX_RESULTS);
  };
}

/**
 * "Where can you work?": quick toggles for home/school state, the eight areas and the whole
 * US, a full state list underneath, and countries outside the US. Posts `work_states` (one
 * checkbox per state), `work_anywhere_us=on` when set, and `work_countries` as JSON.
 */
export function WhereCanYouWork({
  homeState,
  schoolState,
  defaultAnywhere,
  defaultStates,
  defaultCountries,
  statesError,
  countriesError,
}: {
  homeState: string;
  schoolState: string;
  defaultAnywhere: boolean;
  defaultStates: string[];
  defaultCountries: string[];
  statesError?: string;
  countriesError?: string;
}) {
  const [anywhere, setAnywhere] = useState(defaultAnywhere);
  // toggleStates on an empty list dedupes and orders the saved states.
  const [states, setStates] = useState<UsState[]>(() => toggleStates([], defaultStates.filter(isUsState)));
  const [countries, setCountries] = useState<string[]>(defaultCountries);
  const [countryKey, setCountryKey] = useState(0);
  const [listOpen, setListOpen] = useState(defaultStates.length > 0);

  // Anywhere shows every state as picked but keeps the list underneath, so switching it off
  // goes back to what was there.
  const shown = new Set<UsState>(anywhere ? ALL_STATES : states);

  function toggle(group: UsState[]) {
    const next = toggleStates(states, group);
    setStates(next);
    if (next.length > 0) setListOpen(true);
  }

  function flip(code: UsState) {
    setStates((cur) => toggleStates(cur, [code]));
  }

  const toggles: Toggle[] = [];
  if (isUsState(homeState)) {
    toggles.push({ key: 'home', label: `Home state (${homeState})`, states: [homeState] });
  }
  if (isUsState(schoolState) && schoolState !== homeState) {
    toggles.push({ key: 'school', label: `School state (${schoolState})`, states: [schoolState] });
  }
  for (const a of AREAS) toggles.push({ key: a.key, label: a.label, states: a.states });

  const describedBy = ['work-summary', statesError ? errorId('work_states') : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3" aria-describedby={describedBy}>
        <legend className="mb-1 text-sm font-medium">Where can you work?</legend>
        <p className="hint -mt-1">Tap an area to add all of its states. Tap again to remove them.</p>

        {anywhere ? <input type="hidden" name="work_anywhere_us" value="on" /> : null}

        <div className="flex flex-wrap gap-2">
          {toggles.map((t) => {
            const pressed = pressedFor(shown, t.states);
            return (
              <button
                key={t.key}
                type="button"
                className="chip disabled:cursor-default"
                // Under Anywhere every group reads as covered, but quieter than Anywhere itself.
                data-state={anywhere ? 'secondary' : CHIP_STATE[pressed]}
                aria-pressed={pressed}
                disabled={anywhere}
                onClick={() => toggle(t.states)}
              >
                {t.label}
              </button>
            );
          })}
          <button
            type="button"
            className="chip chip-anywhere"
            data-state={anywhere ? 'primary' : 'off'}
            aria-pressed={anywhere}
            onClick={() => setAnywhere((a) => !a)}
          >
            Anywhere in the US
          </button>
        </div>

        <p id="work-summary" className="text-sm text-muted" aria-live="polite">
          <span className={anywhere || states.length ? 'font-medium text-foreground' : undefined}>
            {summary(anywhere, states.length)}
          </span>
        </p>

        <details
          open={listOpen}
          onToggle={(e) => setListOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium text-accent select-none">
            Pick states
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {US_STATES.map((s) => (
              <label
                key={s.code}
                className={`flex items-center gap-2 py-1 text-sm ${anywhere ? 'text-muted' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  name="work_states"
                  value={s.code}
                  checked={shown.has(s.code)}
                  disabled={anywhere}
                  onChange={() => flip(s.code)}
                  className="accent-(--accent)"
                />
                <span className="min-w-0 truncate">{s.name}</span>
              </label>
            ))}
          </div>
        </details>
        <FieldError name="work_states" error={statesError} />
      </fieldset>

      <div className="flex flex-col gap-3">
        <input type="hidden" name="work_countries" value={JSON.stringify(countries)} />
        <Combobox
          key={countryKey}
          name="work_country_search"
          label="Outside the US too?"
          hint="Optional. Countries where you can already work."
          defaultText=""
          defaultId=""
          allowFreeText={false}
          search={searchCountries(countries)}
          onPick={(opt) => {
            if (!opt) return;
            setCountries((cur) => (cur.includes(opt.id) ? cur : [...cur, opt.id]));
            setCountryKey((k) => k + 1);
          }}
          error={countriesError}
        />
        {countries.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Countries outside the US">
            {countries.map((c) => (
              <li key={c} className="tag">
                {countryName(c)}
                <button
                  type="button"
                  aria-label={`Remove ${countryName(c)}`}
                  onClick={() => setCountries((cur) => cur.filter((x) => x !== c))}
                  className="-mr-1 grid size-5 place-items-center rounded-full text-muted hover:text-foreground"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
