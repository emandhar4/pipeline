import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';
import {
  latestResumeSuggestions,
  loadCategories,
  seasonsFor,
  stepOneValues,
  stepTwoValues,
} from './data';
import { StepMarker } from './form-parts';
import { prefillStepOne, prefillStepTwo, stepOneHints, stepTwoHint } from './prefill';
import { ResumeStep } from './resume-step';
import { StepOneForm } from './step-one-form';
import { StepTwoForm } from './step-two-form';

export const metadata: Metadata = { title: 'Set up · Pipeline' };

const STEPS = {
  0: {
    title: 'Start with your resume',
    intro:
      'Optional. Pipeline reads it to fill in your answers and suggest the fields to search. You check everything before it is saved.',
  },
  1: {
    title: 'Who you are',
    intro: 'The basics Pipeline needs to tell which postings you can apply to.',
  },
  2: {
    title: 'What you want',
    intro: 'The work you are after. Pipeline checks every new posting against this each day.',
  },
} as const;

const SAVED_ANSWERS_STAY =
  'Your saved answers stay as they are. Pipeline shows what your resume says next to each one.';

async function Onboarding({ searchParams }: Pick<PageProps<'/onboarding'>, 'searchParams'>) {
  const { id: userId } = await getCurrentUser();
  const [params, state, suggestions] = await Promise.all([
    searchParams,
    getOnboardingState(),
    latestResumeSuggestions(),
  ]);
  // A finished setup is edited on the profile page, not by re-running onboarding.
  if (state.step >= 2 && params.step === undefined) redirect('/profile');
  // A new user without an uploaded resume starts at the optional resume step. Step 2 opens
  // once step 1 is saved; ?step=resume and ?step=1 let the user go back.
  let step: 0 | 1 | 2;
  if (params.step === 'resume') step = 0;
  else if (params.step === undefined && state.step === 0 && !suggestions) step = 0;
  else step = params.step === '1' || state.step < 1 ? 1 : 2;

  let form: React.ReactNode;
  let intro: string = STEPS[step].intro;
  if (step === 0) {
    form = <ResumeStep userId={userId} mode="onboarding" />;
    if (state.step >= 1) intro += ' ' + SAVED_ANSWERS_STAY;
  } else if (step === 1) {
    // Only before step 1 is first saved: after that a blank answer was left blank on purpose,
    // and the resume's suggestions show as hints the user applies by hand.
    const { values, fromResume } = prefillStepOne(stepOneValues(state), suggestions, state.step);
    const hints = stepOneHints(values, suggestions, state.step);
    form = <StepOneForm mode="onboarding" values={values} fromResume={fromResume} hints={hints} />;
  } else {
    const categories = await loadCategories();
    const { values, suggested } = prefillStepTwo(stepTwoValues(state), suggestions, categories);
    form = (
      <StepTwoForm
        mode="onboarding"
        values={values}
        categories={categories}
        seasons={seasonsFor(values.season)}
        suggested={suggested}
        hint={stepTwoHint(values, suggestions, categories)}
      />
    );
  }

  return (
    <>
      <StepMarker step={step} savedStep={state.step} />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{STEPS[step].title}</h1>
      <p className="mt-2 mb-10 max-w-prose text-sm text-muted">{intro}</p>
      {form}
    </>
  );
}

export default function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<div className="h-96" aria-busy="true" />}>
        <Onboarding searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
