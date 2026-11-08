import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';
import { loadCategories, seasonsFor, stepOneValues, stepTwoValues } from '../onboarding/data';
import { StepOneForm } from '../onboarding/step-one-form';
import { StepTwoForm } from '../onboarding/step-two-form';

export const metadata: Metadata = { title: 'Profile · Pipeline' };

async function ProfileForms({ searchParams }: Pick<PageProps<'/profile'>, 'searchParams'>) {
  await getCurrentUser();
  const [params, state, categories] = await Promise.all([
    searchParams,
    getOnboardingState(),
    loadCategories(),
  ]);
  // The profile edits finished answers; an unfinished setup goes back to onboarding.
  if (state.step < 2) redirect('/onboarding');
  const two = stepTwoValues(state);

  return (
    <>
      {params.saved === '1' ? (
        <p
          role="status"
          className="mb-10 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          Saved
        </p>
      ) : null}

      <section aria-labelledby="who-heading" className="flex flex-col gap-8">
        <h2 id="who-heading" className="text-lg font-semibold tracking-tight">
          Who you are
        </h2>
        <StepOneForm mode="profile" values={stepOneValues(state)} />
      </section>

      <section aria-labelledby="what-heading" className="mt-16 flex flex-col gap-8">
        <h2 id="what-heading" className="text-lg font-semibold tracking-tight">
          What you want
        </h2>
        <StepTwoForm
          mode="profile"
          values={two}
          categories={categories}
          seasons={seasonsFor(two.season)}
        />
      </section>
    </>
  );
}

export default function ProfilePage({ searchParams }: PageProps<'/profile'>) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <p className="mt-2 mb-10 max-w-prose text-sm text-muted">
        Your onboarding answers. Change any of them; each section saves on its own.
      </p>
      <Suspense fallback={<div className="h-96" aria-busy="true" />}>
        <ProfileForms searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
