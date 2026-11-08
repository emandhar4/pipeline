'use client';

import { startTransition, useActionState, useState } from 'react';
import { CAREER_STAGES, RELOCATE, WORK_AUTH } from '@/lib/onboarding/options';
import { saveStepOne, type FormMode, type FormState } from './actions';
import { ChoiceGroup, FormMessage, TextField } from './form-parts';

export type StepOneValues = {
  career_stage: string;
  school: string;
  major: string;
  grad_date: string;
  work_auth: string;
  home_location: string;
  school_location: string;
  in_state_school: boolean | null;
  relocate: string;
};

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export function StepOneForm({ mode, values }: { mode: FormMode; values: StepOneValues }) {
  const [state, formAction, pending] = useActionState(saveStepOne.bind(null, mode), {} as FormState);
  const [home, setHome] = useState(values.home_location);
  const [schoolLoc, setSchoolLoc] = useState(values.school_location);
  const errors = state.errors ?? {};
  const askInState = home.trim() !== '' && schoolLoc.trim() !== '';

  // Submitting through onSubmit (not the form action prop) skips React's automatic form
  // reset, so a failed save keeps everything the user typed.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FormMessage message={state.message} />

      <ChoiceGroup
        name="career_stage"
        legend="Where are you in your career?"
        options={CAREER_STAGES}
        defaultValue={values.career_stage}
        error={errors.career_stage}
        columns={2}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="school"
          label="School"
          defaultValue={values.school}
          autoComplete="organization"
          error={errors.school}
          maxLength={200}
        />
        <TextField
          name="major"
          label="Major"
          defaultValue={values.major}
          error={errors.major}
          maxLength={200}
        />
      </div>

      <TextField
        name="grad_date"
        label="Graduation month"
        type="month"
        placeholder="YYYY-MM"
        hint="Past or expected. Leave blank if it does not apply."
        defaultValue={values.grad_date}
        error={errors.grad_date}
        className="field sm:max-w-56"
      />

      <ChoiceGroup
        name="work_auth"
        legend="Work authorization"
        options={WORK_AUTH}
        defaultValue={values.work_auth}
        error={errors.work_auth}
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="home_location"
            label="Home location"
            hint="City and state, or city and country."
            value={home}
            onChange={(e) => setHome(e.target.value)}
            autoComplete="address-level2"
            error={errors.home_location}
            maxLength={200}
          />
          <TextField
            name="school_location"
            label="School location"
            hint="Where you study now, if you do."
            value={schoolLoc}
            onChange={(e) => setSchoolLoc(e.target.value)}
            error={errors.school_location}
            maxLength={200}
          />
        </div>
        {askInState ? (
          <ChoiceGroup
            name="in_state_school"
            legend="Is your school in your home state?"
            options={YES_NO}
            defaultValue={
              values.in_state_school === null ? null : values.in_state_school ? 'yes' : 'no'
            }
            error={errors.in_state_school}
            columns={3}
          />
        ) : null}
      </div>

      <ChoiceGroup
        name="relocate"
        legend="Would you move for a job?"
        options={RELOCATE}
        defaultValue={values.relocate}
        error={errors.relocate}
      />

      <div className="flex items-center gap-4 border-t border-line pt-6">
        <button type="submit" disabled={pending} className="btn-primary min-w-32">
          {pending ? 'Saving…' : mode === 'profile' ? 'Save changes' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
