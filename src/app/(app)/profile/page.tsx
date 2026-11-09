import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';
import {
  latestResume,
  loadCategories,
  seasonsFor,
  stepOneValues,
  stepTwoValues,
} from '../onboarding/data';
import { stepOneHints, stepTwoHint } from '../onboarding/prefill';
import { ResumeStep } from '../onboarding/resume-step';
import { StepOneForm } from '../onboarding/step-one-form';
import { StepTwoForm } from '../onboarding/step-two-form';
import { createClient } from '@/lib/supabase/server';
import { BarSection } from './bar-section';
import { CompaniesSection, type WatchedCompany } from './companies-section';

export const metadata: Metadata = { title: 'Profile · Pipeline' };

const readFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mb-10 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
      {children}
    </p>
  );
}

async function ProfileForms({ searchParams }: Pick<PageProps<'/profile'>, 'searchParams'>) {
  const { id: userId } = await getCurrentUser();
  const [params, state, categories, resume] = await Promise.all([
    searchParams,
    getOnboardingState(),
    loadCategories(),
    latestResume(),
  ]);
  // The profile edits finished answers; an unfinished setup goes back to onboarding.
  if (state.step < 2) redirect('/onboarding');
  const one = stepOneValues(state);
  const two = stepTwoValues(state);
  const suggestions = resume?.suggestions ?? null;
  const supabase = await createClient();
  const watched = await supabase
    .from('user_companies')
    .select('created_at, relation, companies(id, name, ats, coverage, coverage_reason)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (watched.error) console.error('[profile] read watched companies failed', { message: watched.error.message });
  const companies: WatchedCompany[] = (watched.data ?? []).flatMap((r) =>
    r.companies ? [{ ...(r.companies as Omit<WatchedCompany, 'relation'>), relation: r.relation ?? 'target' }] : [],
  );
  const barRow = await supabase
    .from('bars')
    .select('company, role, pay_cents, pay_period')
    .eq('user_id', userId)
    .maybeSingle();
  if (barRow.error) console.error('[profile] read bar failed', { message: barRow.error.message });

  return (
    <>
      {params.saved === '1' ? <Banner>Saved</Banner> : null}
      {params.resume === '1' && resume ? (
        <Banner>We read your resume. Its suggestions are shown next to your answers below.</Banner>
      ) : null}

      <section id="resume" aria-labelledby="resume-heading" className="flex flex-col gap-4">
        <h2 id="resume-heading" className="text-lg font-semibold tracking-tight">
          Resume
        </h2>
        <p className="max-w-prose text-sm text-muted">
          {resume
            ? `Last read ${readFormat.format(new Date(resume.readAt))}.`
            : 'Upload your resume and Pipeline suggests answers from it. Nothing changes until you save.'}
        </p>
        <ResumeStep userId={userId} mode="profile" hasResume={!!resume} />
      </section>

      <section aria-labelledby="who-heading" className="mt-16 flex flex-col gap-8">
        <h2 id="who-heading" className="scroll-mt-6 text-lg font-semibold tracking-tight">
          Who you are
        </h2>
        {/* Keyed by the saved answers so a save clears "Use this" state and badges. */}
        <StepOneForm
          key={JSON.stringify(one)}
          mode="profile"
          values={one}
          hints={stepOneHints(one, suggestions, state.step)}
        />
      </section>

      <section aria-labelledby="what-heading" className="mt-16 flex flex-col gap-8">
        <h2 id="what-heading" className="text-lg font-semibold tracking-tight">
          What you want
        </h2>
        <StepTwoForm
          key={JSON.stringify(two.fields)}
          mode="profile"
          values={two}
          categories={categories}
          seasons={seasonsFor(two.season)}
          hint={stepTwoHint(two, suggestions, categories)}
        />
      </section>

      <BarSection bar={barRow.data ?? null} />

      <CompaniesSection companies={companies} loadFailed={!!watched.error} />
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
