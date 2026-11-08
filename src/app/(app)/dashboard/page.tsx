import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getOnboardingState } from '@/lib/onboarding/profile';
import { PanelBoundary } from './panel-boundary';
import { HealthPanel } from './health-panel';
import { PostingsPanel } from './postings-panel';
import { TodayPanel } from './today-panel';

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

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="panel" aria-busy="true">
      <div className="skeleton h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <RequireOnboarded>
        <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="sr-only">Dashboard</h1>
          <div className="grid gap-10 md:grid-cols-2 md:gap-x-12">
            <PanelBoundary title="Today">
              <Suspense fallback={<PanelSkeleton />}>
                <TodayPanel />
              </Suspense>
            </PanelBoundary>
            <PanelBoundary title="New postings worth it">
              <Suspense fallback={<PanelSkeleton />}>
                <PostingsPanel />
              </Suspense>
            </PanelBoundary>
            <div className="md:col-span-2">
              <PanelBoundary title="Pipeline health">
                <Suspense fallback={<PanelSkeleton rows={5} />}>
                  <HealthPanel />
                </Suspense>
              </PanelBoundary>
            </div>
          </div>
          <p className="mt-12 text-sm text-muted">
            Signed in as{' '}
            <Suspense fallback={null}>
              <SignedInAs />
            </Suspense>
          </p>
        </main>
      </RequireOnboarded>
    </Suspense>
  );
}
