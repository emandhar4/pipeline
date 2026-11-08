'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { CAREER_STAGES, WORK_AUTH, WORK_STYLES } from '@/lib/onboarding/options';
import { US_STATES, stateFromLocation } from '@/lib/onboarding/regions';
import { saveStepOne, type FormMode, type FormState } from './actions';
import { Combobox } from './combobox';
import {
  ChoiceGroup,
  FieldBadge,
  FieldError,
  FormMessage,
  PrefillNotice,
  SubmitSummary,
  TextField,
  badgeId,
  errorId,
  type ResumeHintProps,
} from './form-parts';
import { findMajors, findSchools } from './lookup-actions';
import { answersFilled, type StepOneHint, type StepOneHints } from './prefill';
import { useFocusOnError } from './use-focus-on-error';
import { WhereCanYouWork } from './where-can-you-work';

export type StepOneValues = {
  career_stage: string;
  school: string;
  school_id: string;
  major: string;
  major_cip: string;
  grad_date: string;
  work_auth: string;
  home_location: string;
  home_state: string;
  school_location: string;
  school_state: string;
  work_anywhere_us: boolean;
  work_states: string[];
  work_countries: string[];
  work_style: string;
};

// "Outside the US" posts '' like "Choose…", but the select needs its own value to show it.
const OUTSIDE = 'outside';

/**
 * A US state picker. The select itself is unnamed; a hidden input posts the state code, or ''
 * for "Choose…" and "Outside the US".
 */
function StateSelect({
  name,
  label,
  value,
  onChange,
  error,
  badge,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  badge?: string;
}) {
  const describedBy = [badge ? badgeId(name) : null, error ? errorId(name) : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        <FieldBadge name={name}>{badge}</FieldBadge>
      </div>
      <select
        id={name}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        <option value="">Choose…</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
        <option value={OUTSIDE}>Outside the US</option>
      </select>
      <input type="hidden" name={name} value={value === OUTSIDE ? '' : value} />
      <FieldError name={name} error={error} />
    </div>
  );
}

const FROM_RESUME = 'from resume';

export function StepOneForm({
  mode,
  values,
  fromResume = [],
  hints = {},
}: {
  mode: FormMode;
  values: StepOneValues;
  /** Fields pre-filled from the user's resume; each shows a badge. */
  fromResume?: string[];
  /** What the resume says where it differs from a saved answer; applied by hand, never saved by itself. */
  hints?: StepOneHints;
}) {
  const [state, formAction, pending] = useActionState(saveStepOne.bind(null, mode), {} as FormState);
  // Values put in by "Use this". Uncontrolled fields remount (new key) to show them.
  const [overrides, setOverrides] = useState<Partial<StepOneValues>>({});
  const [remounts, setRemounts] = useState<Record<string, number>>({});
  const [usedHints, setUsedHints] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string>();
  const v = { ...values, ...overrides };
  const [schoolLoc, setSchoolLoc] = useState(values.school_location);
  const [homeState, setHomeState] = useState(values.home_state);
  const [schoolState, setSchoolState] = useState(values.school_state);
  const [workStyle, setWorkStyle] = useState(values.work_style);
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnError(formRef, state, Object.keys(errors).length > 0 || !!state.message);
  const badge = (name: keyof StepOneValues) =>
    fromResume.includes(name) || applied.includes(name) ? FROM_RESUME : undefined;
  const filled = answersFilled(fromResume);

  // The "Use this" button goes away once used, so focus moves to the field it filled.
  useEffect(() => {
    if (focusId) document.getElementById(focusId)?.focus();
  }, [focusId, remounts]);

  function applyHint(key: keyof StepOneHints, hint: StepOneHint) {
    const { set } = hint;
    setOverrides((o) => ({ ...o, ...set }));
    if (set.school_location !== undefined) setSchoolLoc(set.school_location);
    if (set.school_state !== undefined) setSchoolState(set.school_state);
    if (set.home_state !== undefined) setHomeState(set.home_state);
    setRemounts((r) => ({ ...r, [key]: (r[key] ?? 0) + 1 }));
    setApplied((a) => [...a, ...Object.keys(set)]);
    setUsedHints((u) => [...u, key]);
    setFocusId(key);
  }

  function hintFor(key: keyof StepOneHints): ResumeHintProps | undefined {
    const hint = hints[key];
    if (!hint || usedHints.includes(key)) return undefined;
    return { text: hint.text, onUse: () => applyHint(key, hint) };
  }
  const keyFor = (name: string) => `${name}-${remounts[name] ?? 0}`;

  // Submitting through onSubmit (not the form action prop) skips React's automatic form
  // reset, so a failed save keeps everything the user typed.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FormMessage message={state.message} />
      {filled > 0 ? (
        <PrefillNotice>
          We filled in {filled} {filled === 1 ? 'answer' : 'answers'} from your resume. Check them
          before you continue.
        </PrefillNotice>
      ) : null}

      <ChoiceGroup
        name="career_stage"
        legend="Where are you in your career?"
        options={CAREER_STAGES}
        defaultValue={values.career_stage}
        error={errors.career_stage}
        columns={2}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Combobox
          key={keyFor('school')}
          name="school"
          idName="school_id"
          label="School"
          defaultText={v.school}
          defaultId={v.school_id}
          search={findSchools}
          allowFreeText
          onPick={(opt) => {
            // A picked school fills in where it is; both stay editable.
            if (!opt?.detail) return;
            setSchoolLoc(opt.detail);
            const st = stateFromLocation(opt.detail);
            if (st) setSchoolState(st);
          }}
          error={errors.school}
          badge={badge('school')}
          resumeHint={hintFor('school')}
        />
        <Combobox
          key={keyFor('major')}
          name="major"
          idName="major_cip"
          label="Major"
          defaultText={v.major}
          defaultId={v.major_cip}
          search={findMajors}
          allowFreeText
          error={errors.major}
          badge={badge('major')}
          resumeHint={hintFor('major')}
        />
      </div>

      <TextField
        key={keyFor('grad_date')}
        name="grad_date"
        label="Graduation month"
        type="month"
        placeholder="YYYY-MM"
        hint="Past or expected. Leave blank if it does not apply."
        defaultValue={v.grad_date}
        error={errors.grad_date}
        badge={badge('grad_date')}
        resumeHint={hintFor('grad_date')}
        className="field sm:max-w-56"
      />

      <ChoiceGroup
        name="work_auth"
        legend="Work authorization"
        options={WORK_AUTH}
        defaultValue={values.work_auth}
        error={errors.work_auth}
      />

      <div className="grid gap-5 sm:grid-cols-[3fr_2fr]">
        <TextField
          key={keyFor('home_location')}
          name="home_location"
          label="Home city"
          defaultValue={v.home_location}
          autoComplete="address-level2"
          error={errors.home_location}
          badge={badge('home_location')}
          resumeHint={hintFor('home_location')}
          maxLength={200}
        />
        <StateSelect
          name="home_state"
          label="Home state"
          value={homeState}
          onChange={setHomeState}
          error={errors.home_state}
          badge={badge('home_state')}
        />
        <TextField
          name="school_location"
          label="School location"
          hint="Where you study now, if you do."
          value={schoolLoc}
          onChange={(e) => setSchoolLoc(e.target.value)}
          error={errors.school_location}
          badge={badge('school_location')}
          maxLength={200}
        />
        <StateSelect
          name="school_state"
          label="School state"
          value={schoolState}
          onChange={setSchoolState}
          error={errors.school_state}
          badge={badge('school_state')}
        />
      </div>

      <ChoiceGroup
        name="work_style"
        legend="How do you want to work?"
        options={WORK_STYLES}
        defaultValue={values.work_style}
        error={errors.work_style}
        onChange={setWorkStyle}
      />

      {/* Remote only hides the picker. The disabled fieldset posts none of its fields but keeps
          the picker's state, so switching back restores the places. */}
      <fieldset disabled={workStyle === 'remote_only'} hidden={workStyle === 'remote_only'}>
        <WhereCanYouWork
          homeState={homeState}
          schoolState={schoolState}
          defaultAnywhere={values.work_anywhere_us}
          defaultStates={values.work_states}
          defaultCountries={values.work_countries}
          statesError={errors.work_states}
          countriesError={errors.work_countries}
        />
      </fieldset>

      <div className="flex items-center gap-4 border-t border-line pt-6">
        <button type="submit" disabled={pending} className="btn-primary min-w-32">
          {pending ? 'Saving…' : mode === 'profile' ? 'Save changes' : 'Continue'}
        </button>
        <SubmitSummary count={Object.keys(errors).length} />
      </div>
    </form>
  );
}
