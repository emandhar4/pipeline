import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';
import { loadCategories, seasonsFor, stepOneValues, stepTwoValues } from './data';
import { StepMarker } from './form-parts';
import { StepOneForm } from './step-one-form';
import { StepTwoForm } from './step-two-form';

export const metadata: Metadata = { title: 'Set up · Pipeline' };

const STEPS = {
  1: {
    title: 'Who you are',
    intro: 'The basics Pipeline needs to tell which postings you can apply to.',
  },
  2: {
    title: 'What you want',
    intro: 'The work you are after. Pipeline checks every new posting against this each day.',
  },
} as const;

async function Onboarding({ searchParams }: Pick<PageProps<'/onboarding'>, 'searchParams'>) {
  await getCurrentUser();
  const [params, state] = await Promise.all([searchParams, getOnboardingState()]);
  // Step 2 opens once step 1 is saved; ?step=1 lets the user go back to it.
  const step = params.step === '1' || state.step < 1 ? 1 : 2;

  let form: React.ReactNode;
  if (step === 1) {
    form = <StepOneForm mode="onboarding" values={stepOneValues(state)} />;
  } else {
    const values = stepTwoValues(state);
    form = (
      <StepTwoForm
        mode="onboarding"
        values={values}
        categories={await loadCategories()}
        seasons={seasonsFor(values.season)}
      />
    );
  }

  return (
    <>
      <StepMarker step={step} />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{STEPS[step].title}</h1>
      <p className="mt-2 mb-10 max-w-prose text-sm text-muted">{STEPS[step].intro}</p>
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
