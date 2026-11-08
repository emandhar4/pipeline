import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Dashboard · Pipeline' };

async function SignedInAs() {
  const user = await getCurrentUser();
  return <span className="font-medium text-foreground">{user.email}</span>;
}

// Placeholder until Phase 2 builds the real dashboard.
export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as{' '}
        <Suspense fallback={<span className="inline-block h-4 w-40 align-middle" />}>
          <SignedInAs />
        </Suspense>
      </p>
      <p className="mt-8 max-w-prose text-sm text-muted">
        Your matches and next steps will show up here.
      </p>
      <form action="/auth/signout" method="post" className="mt-10">
        <button type="submit" className="btn-secondary">
          Sign out
        </button>
      </form>
    </main>
  );
}
