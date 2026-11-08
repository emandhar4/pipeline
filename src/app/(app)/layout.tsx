import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { NavLinks } from './nav-links';

/** Verifies the session server-side; the proxy redirect is only the first line of defense. */
async function RequireUser({ children }: { children: React.ReactNode }) {
  await getCurrentUser();
  return <>{children}</>;
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="wordmark mr-auto">
            Pipeline
          </Link>
          <nav aria-label="Main" className="flex h-full items-center gap-4 sm:gap-6">
            <Suspense fallback={null}>
              <NavLinks />
            </Suspense>
            {/* POST only, so a prefetch or cross-site link cannot sign the user out. */}
            <form action="/auth/signout" method="post" className="flex h-full items-center">
              <button type="submit" className="nav-link">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
        <RequireUser>{children}</RequireUser>
      </Suspense>
    </div>
  );
}
