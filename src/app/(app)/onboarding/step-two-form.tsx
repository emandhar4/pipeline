'use client';

import Link from 'next/link';
import { startTransition, useActionState, useRef, useState } from 'react';
import type { PayPeriod } from '@/lib/onboarding/options';
import { saveStepTwo, type FormMode, type FormState } from './actions';
import { FieldError, FormMessage, PrefillNotice, SubmitSummary, errorId } from './form-parts';
import { useFocusOnError } from './use-focus-on-error';

export type Category = { slug: string; name: string };
type Weight = 'primary' | 'secondary';
type Preference = 'prefer' | 'avoid';

export type StepTwoValues = {
  fields: { category_slug: string | null; label: string; weight: Weight }[];
  industries: { industry: string; preference: Preference }[];
  pay_amount: string;
  pay_period: PayPeriod;
  season: string;
};

type ChipState = Weight | 'off';
type Chip = { key: string; category_slug: string | null; label: string; state: ChipState };

const MAX_FIELDS = 12;
const MAX_INDUSTRIES = 20;
const NEXT: Record<ChipState, ChipState> = { off: 'primary', primary: 'secondary', secondary: 'off' };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function initialChips(categories: Category[], fields: StepTwoValues['fields']): Chip[] {
  const chips: Chip[] = categories.map((c) => {
    const saved = fields.find((f) => f.category_slug === c.slug);
    return { key: c.slug, category_slug: c.slug, label: c.name, state: saved?.weight ?? 'off' };
  });
  for (const f of fields) {
    if (f.category_slug && categories.some((c) => c.slug === f.category_slug)) continue;
    chips.push({ key: `own:${f.label}`, category_slug: null, label: f.label, state: f.weight });
  }
  return chips;
}

/** Adds (or switches on) a custom field chip. Null when it would pass the field cap. */
function withOwnField(chips: Chip[], draft: string): Chip[] | null {
  const label = draft.trim().slice(0, 100);
  if (!label) return chips;
  // Typing a name that already has a chip turns that chip on instead of adding a twin.
  const next = chips.some((c) => same(c.label, label))
    ? chips.map((c) => (same(c.label, label) && c.state === 'off' ? { ...c, state: 'primary' as const } : c))
    : [...chips, { key: `own:${label}`, category_slug: null, label, state: 'primary' as const }];
  return next.filter((c) => c.state !== 'off').length > MAX_FIELDS ? null : next;
}

/** Adds an industry to a list, moving it from the other list. Null when the cap is reached. */
function withIndustry(
  industries: StepTwoValues['industries'],
  draft: string,
  preference: Preference,
): StepTwoValues['industries'] | null {
  const industry = draft.trim().slice(0, 100);
  if (!industry) return industries;
  const rest = industries.filter((i) => !same(i.industry, industry));
  if (rest.length >= MAX_INDUSTRIES) return null;
  return [...rest, { industry, preference }];
}

function fieldsOf(chips: Chip[]): string {
  return JSON.stringify(
    chips
      .filter((c) => c.state !== 'off')
      .map((c) => ({ category_slug: c.category_slug, label: c.label, weight: c.state })),
  );
}

/** "Supply Chain (primary), Data Analysis (secondary)", primary first, known categories only. */
function suggestedText(suggested: string[], values: StepTwoValues, categories: Category[]): string {
  const rank = { primary: 0, secondary: 1 } as const;
  return values.fields
    .filter((f) => f.category_slug && suggested.includes(f.category_slug))
    .map((f) => ({ name: categories.find((c) => c.slug === f.category_slug)?.name, weight: f.weight }))
    .filter((f): f is { name: string; weight: Weight } => !!f.name)
    .sort((a, b) => rank[a.weight] - rank[b.weight])
    .map((f) => `${f.name} (${f.weight})`)
    .join(', ');
}

function Dot({ state }: { state: ChipState }) {
  return <span className="chip-dot" data-state={state} aria-hidden="true" />;
}

export function StepTwoForm({
  mode,
  values,
  categories,
  seasons,
  suggested = [],
}: {
  mode: FormMode;
  values: StepTwoValues;
  categories: Category[];
  seasons: string[];
  /** Category slugs switched on from the user's resume. */
  suggested?: string[];
}) {
  const [state, formAction, pending] = useActionState(saveStepTwo.bind(null, mode), {} as FormState);
  const [chips, setChips] = useState(() => initialChips(categories, values.fields));
  const [ownDraft, setOwnDraft] = useState('');
  const [industries, setIndustries] = useState(values.industries);
  const [drafts, setDrafts] = useState<Record<Preference, string>>({ prefer: '', avoid: '' });
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(values.pay_period);
  const [season, setSeason] = useState(values.season);
  const errors = state.errors ?? {};
  const [draftState, setPendingErrors] = useState<{ errors: Record<string, string> }>({ errors: {} });
  const draftErrors = draftState.errors;
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnError(formRef, state, Object.keys(errors).length > 0 || !!state.message);
  useFocusOnError(formRef, draftState, Object.keys(draftErrors).length > 0);

  const picked = chips.filter((c) => c.state !== 'off');
  const industriesFull = industries.length >= MAX_INDUSTRIES;

  function clearDraftError(key: string) {
    setPendingErrors((p) => {
      if (!(key in p.errors)) return p;
      const rest = { ...p.errors };
      delete rest[key];
      return { errors: rest };
    });
  }

  function cycle(key: string) {
    setChips((cs) => cs.map((c) => (c.key === key ? { ...c, state: NEXT[c.state] } : c)));
  }

  function addOwn() {
    if (!ownDraft.trim()) return;
    const next = withOwnField(chips, ownDraft);
    if (!next) {
      setPendingErrors({ errors: { own: `Up to ${MAX_FIELDS} fields. Switch one off to add this.` } });
      return;
    }
    setChips(next);
    setOwnDraft('');
  }

  function addIndustry(preference: Preference) {
    if (!drafts[preference].trim()) return;
    // One industry lives in one list; adding it to the other list moves it.
    // At the cap, keep the typed text so nothing is lost; the "Up to 20" note explains why.
    const next = withIndustry(industries, drafts[preference], preference);
    if (!next) return;
    setIndustries(next);
    setDrafts((d) => ({ ...d, [preference]: '' }));
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>, add: () => void) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  }

  // Text typed but not added is added now, with the same rules as the Add buttons. If it cannot
  // be added, the submit stops with a message beside that input rather than dropping the text.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const blocked: Record<string, string> = {};

    let nextChips = chips;
    if (ownDraft.trim()) {
      const next = withOwnField(chips, ownDraft);
      if (next) nextChips = next;
      else blocked.own = `Up to ${MAX_FIELDS} fields. Switch one off, or clear this box, to continue.`;
    }
    let nextIndustries = industries;
    for (const pref of ['prefer', 'avoid'] as const) {
      if (!drafts[pref].trim()) continue;
      const next = withIndustry(nextIndustries, drafts[pref], pref);
      if (next) nextIndustries = next;
      else
        blocked[pref] = `Up to ${MAX_INDUSTRIES} industries. Remove one, or clear this box, to continue.`;
    }
    if (Object.keys(blocked).length > 0) {
      setPendingErrors({ errors: blocked });
      return;
    }

    setPendingErrors({ errors: {} });
    setChips(nextChips);
    setOwnDraft('');
    setIndustries(nextIndustries);
    setDrafts({ prefer: '', avoid: '' });
    data.set('fields', fieldsOf(nextChips));
    data.set('industries', JSON.stringify(nextIndustries));
    startTransition(() => formAction(data));
  }

  const fieldsJson = fieldsOf(chips);
  const suggestion = suggested.length > 0 ? suggestedText(suggested, values, categories) : '';

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <FormMessage message={state.message} />
      {suggestion ? (
        <PrefillNotice>
          Suggested from your resume: {suggestion}. Change anything that&apos;s off.
        </PrefillNotice>
      ) : null}
      <input type="hidden" name="fields" value={fieldsJson} />
      <input type="hidden" name="industries" value={JSON.stringify(industries)} />

      <fieldset
        className="flex flex-col gap-4"
        aria-describedby={['chip-legend', errors.fields ? errorId('fields') : '']
          .filter(Boolean)
          .join(' ')}
      >
        <legend className="mb-1 text-sm font-medium">Fields you want to work in</legend>
        <div id="chip-legend" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <span>Tap to cycle through:</span>
          <span className="inline-flex items-center gap-2">
            <Dot state="primary" />
            <span>Primary, your main target</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Dot state="secondary" />
            <span>Secondary, also open to it</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Dot state="off" />
            <span>Off</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="chip"
              data-state={c.state}
              aria-pressed={c.state !== 'off'}
              onClick={() => cycle(c.key)}
            >
              <Dot state={c.state} />
              {c.label}
              {c.state !== 'off' ? <span className="sr-only">, {c.state}</span> : null}
            </button>
          ))}
          <span className="chip-add">
            <label htmlFor="own-field" className="sr-only">
              Add your own field
            </label>
            <span aria-hidden="true">+</span>
            <input
              id="own-field"
              value={ownDraft}
              maxLength={100}
              placeholder="Add your own"
              onChange={(e) => {
                setOwnDraft(e.target.value);
                clearDraftError('own');
              }}
              onKeyDown={(e) => onEnter(e, addOwn)}
              aria-invalid={draftErrors.own ? true : undefined}
              aria-describedby={draftErrors.own ? errorId('own') : undefined}
              className="w-32 bg-transparent outline-none placeholder:text-muted"
            />
            {ownDraft.trim() ? (
              <button type="button" onClick={addOwn} className="font-medium text-accent">
                Add
              </button>
            ) : null}
          </span>
        </div>
        <p className={`text-sm ${picked.length > MAX_FIELDS ? 'text-danger' : 'text-muted'}`}>
          {picked.length} picked, up to {MAX_FIELDS}.
        </p>
        <FieldError name="own" error={draftErrors.own} />
        <FieldError name="fields" error={errors.fields} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-medium">Industries</legend>
        <p className="hint">Optional. Name industries you want, and any you would rather skip.</p>
        <div className="grid gap-6 sm:grid-cols-2">
          {(['prefer', 'avoid'] as const).map((pref) => {
            const id = `industry-${pref}`;
            const list = industries.filter((i) => i.preference === pref);
            const label = pref === 'prefer' ? 'Prefer' : 'Avoid';
            return (
              <div key={pref} className="flex flex-col gap-2">
                <label htmlFor={id} className="text-sm font-medium">
                  {label}
                </label>
                <div className="flex gap-2">
                  <input
                    id={id}
                    value={drafts[pref]}
                    maxLength={100}
                    placeholder={pref === 'prefer' ? 'e.g. Renewable energy' : 'e.g. Tobacco'}
                    onChange={(e) => {
                      setDrafts((d) => ({ ...d, [pref]: e.target.value }));
                      clearDraftError(pref);
                    }}
                    aria-invalid={draftErrors[pref] ? true : undefined}
                    aria-describedby={draftErrors[pref] ? errorId(pref) : undefined}
                    onKeyDown={(e) => onEnter(e, () => addIndustry(pref))}
                    className="field min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={industriesFull}
                    onClick={() => addIndustry(pref)}
                    aria-label={`Add to ${label}`}
                  >
                    Add
                  </button>
                </div>
                <FieldError name={pref} error={draftErrors[pref]} />
                {list.length ? (
                  <ul className="flex flex-wrap gap-2" aria-label={`${label} list`}>
                    {list.map((i) => (
                      <li key={i.industry} className="tag" data-pref={pref}>
                        {i.industry}
                        <button
                          type="button"
                          aria-label={`Remove ${i.industry}`}
                          onClick={() =>
                            setIndustries((all) => all.filter((x) => !same(x.industry, i.industry)))
                          }
                          className="-mr-1 grid size-5 place-items-center rounded-full text-muted hover:text-foreground"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        {industriesFull ? (
          <p role="status" className="hint">
            Up to {MAX_INDUSTRIES}. Remove one to add another.
          </p>
        ) : null}
        <FieldError name="industries" error={errors.industries} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pay_amount" className="text-sm font-medium">
          Lowest pay you would take
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">
              $
            </span>
            <input
              id="pay_amount"
              name="pay_amount"
              inputMode="decimal"
              defaultValue={values.pay_amount}
              maxLength={30}
              aria-invalid={errors.pay_amount ? true : undefined}
              aria-describedby={['pay-hint', errors.pay_amount ? errorId('pay_amount') : '']
                .filter(Boolean)
                .join(' ')}
              className="field w-36 pl-7"
            />
          </div>
          <div role="radiogroup" aria-label="Pay period" className="segment">
            {(['hour', 'year'] as const).map((p) => (
              <label key={p}>
                <input
                  type="radio"
                  name="pay_period"
                  value={p}
                  checked={payPeriod === p}
                  onChange={() => setPayPeriod(p)}
                  className="sr-only"
                />
                per {p}
              </label>
            ))}
          </div>
        </div>
        <p id="pay-hint" className="hint">
          Leave blank for no floor.
        </p>
        <FieldError name="pay_amount" error={errors.pay_amount} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="season" className="text-sm font-medium">
          Season
        </label>
        <select
          id="season"
          name="season"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          aria-invalid={errors.season ? true : undefined}
          aria-describedby={['season-hint', errors.season ? errorId('season') : '']
            .filter(Boolean)
            .join(' ')}
          className="field sm:max-w-56"
        >
          <option value="" disabled>
            Choose a season
          </option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p id="season-hint" className="hint">
          When you want to start.
        </p>
        <FieldError name="season" error={errors.season} />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <button type="submit" disabled={pending} className="btn-primary min-w-32">
          {pending ? 'Saving…' : mode === 'profile' ? 'Save changes' : 'Finish setup'}
        </button>
        <SubmitSummary count={Object.keys(errors).length + Object.keys(draftErrors).length} />
        {mode === 'onboarding' ? (
          <Link href="/onboarding?step=1" className="text-sm text-muted hover:text-foreground">
            Back to step 1
          </Link>
        ) : null}
      </div>
    </form>
  );
}
