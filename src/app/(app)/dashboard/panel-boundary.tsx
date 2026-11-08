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

class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  retry = () => {
    this.props.onRetry();
    this.setState({ failed: false });
  };
  render() {
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
