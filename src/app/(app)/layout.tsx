import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';

/** Verifies the session server-side; the proxy redirect is only the first line of defense. */
async function RequireUser({ children }: { children: React.ReactNode }) {
  await getCurrentUser();
  return <>{children}</>;
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-6">
          <Link href="/dashboard" className="wordmark">
            Pipeline
          </Link>
        </div>
      </header>
      <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
        <RequireUser>{children}</RequireUser>
      </Suspense>
    </div>
  );
}
