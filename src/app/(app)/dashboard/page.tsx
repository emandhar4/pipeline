import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';

export const metadata: Metadata = { title: 'Dashboard · Pipeline' };

/** Keeps users out of the dashboard until both onboarding steps are saved. */
async function RequireOnboarded({ children }: { children: React.ReactNode }) {
  await getCurrentUser();
  const { step } = await getOnboardingState();
  if (step < 2) redirect('/onboarding');
  return <>{children}</>;
}

async function SignedInAs() {
  const user = await getCurrentUser();
  return <span className="font-medium text-foreground">{user.email}</span>;
}

// Placeholder until Phase 2 Task 4 builds the real dashboard.
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <RequireOnboarded>
        <main className="mx-auto w-full max-w-5xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-2 text-sm text-muted">
            Signed in as <SignedInAs />
          </p>
          <p className="mt-8 max-w-prose text-sm text-muted">
            Your matches and next steps will show up here.
          </p>
        </main>
      </RequireOnboarded>
    </Suspense>
  );
}
