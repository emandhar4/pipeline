'use client';

export default function AppError({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="panel-note">Couldn&apos;t load this page.</p>
      <button type="button" onClick={() => retry()} className="btn-secondary mt-4">
        Try again
      </button>
    </main>
  );
}
