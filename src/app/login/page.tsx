import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LOGIN_ERRORS, type LoginErrorCode } from '@/lib/auth-errors';
import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · Pipeline' };

function errorMessage(code: string | string[] | undefined): string | null {
  if (typeof code !== 'string') return null;
  return code in LOGIN_ERRORS ? LOGIN_ERRORS[code as LoginErrorCode] : null;
}

async function LoginFormFromParams({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === 'string' ? params.next : null);
  return <LoginForm next={next} error={errorMessage(params.error)} />;
}

export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="wordmark mb-10">Pipeline</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Every posting that fits you, every day. Pipeline is invite-only.
        </p>
        <Suspense fallback={<div className="h-56" aria-busy="true" />}>
          <LoginFormFromParams {...props} />
        </Suspense>
      </div>
    </main>
  );
}
