'use client';

import { useRouter } from 'next/navigation';
import { Component, startTransition, type ReactNode } from 'react';

function Failed({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <section aria-label={title} className="panel">
      <h2 className="panel-title">{title}</h2>
      <p role="alert" className="panel-note">
        Couldn&apos;t load this section.
      </p>
      <button type="button" onClick={onRetry} className="btn-secondary mt-3">
        Try again
      </button>
    </section>
  );
}

type Props = { title: string; children: ReactNode; onRetry: () => void };
type BoundaryState = { failed: boolean; error: unknown };

/** redirect(), notFound() and friends are thrown as errors with a marker digest. */
function isNavigationError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'))
  );
}

class Boundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { failed: false, error: null };
  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, error };
  }
  retry = () => {
    this.props.onRetry();
    this.setState({ failed: false, error: null });
  };
  render() {
    // Navigation errors are not failures: pass them up so Next can redirect or show not-found.
    if (this.state.failed && isNavigationError(this.state.error)) throw this.state.error;
    return this.state.failed ? <Failed title={this.props.title} onRetry={this.retry} /> : this.props.children;
  }
}

/** Isolates one dashboard panel: a failed query shows a retry in place and leaves the rest alone. */
export function PanelBoundary({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Boundary title={title} onRetry={() => startTransition(() => router.refresh())}>
      {children}
    </Boundary>
  );
}
