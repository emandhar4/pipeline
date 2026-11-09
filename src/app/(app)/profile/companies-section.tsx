'use client';

import { useActionState } from 'react';
import { coverageText, type CoverageStatus } from '@/lib/companies/ats-labels';
import type { Database } from '@/lib/database.types';
import { addCompany, removeCompany, type CompanyFormState } from './company-actions';

export type WatchedCompany = {
  id: string;
  name: string;
  ats: Database['public']['Enums']['ats_kind'];
  coverage: CoverageStatus;
  coverage_reason: string | null;
};

export function CompaniesSection({ companies }: { companies: WatchedCompany[] }) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(addCompany, {});
  return (
    <section id="companies" aria-labelledby="companies-heading" className="mt-16 flex flex-col gap-6">
      <h2 id="companies-heading" className="scroll-mt-6 text-lg font-semibold tracking-tight">
        Companies to watch
      </h2>
      <p className="max-w-prose text-sm text-muted">
        Add companies you care about. Pipeline keeps every kind of role from them, not only early-career ones.
      </p>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-name" className="text-sm font-medium">Company name</label>
          <input
            id="company-name"
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            className="field"
            aria-invalid={state.errors?.name ? true : undefined}
            aria-describedby={state.errors?.name ? 'company-name-error' : undefined}
          />
          {state.errors?.name ? <p id="company-name-error" className="field-error">{state.errors.name}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-url" className="text-sm font-medium">
            Careers page link <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="company-url"
            name="careers_url"
            type="text"
            inputMode="url"
            autoComplete="off"
            className="field"
            aria-invalid={state.errors?.careers_url ? true : undefined}
            aria-describedby={state.errors?.careers_url ? 'company-url-error' : undefined}
          />
          {state.errors?.careers_url ? (
            <p id="company-url-error" className="field-error">{state.errors.careers_url}</p>
          ) : null}
        </div>
        {state.message ? <p role="alert" className="field-error">{state.message}</p> : null}
        <div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Adding…' : 'Add company'}
          </button>
        </div>
      </form>
      {companies.length > 0 ? (
        <ul className="divide-y divide-line border-y border-line">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-sm text-muted">{coverageText(c)}</p>
              </div>
              <form action={removeCompany.bind(null, c.id)}>
                <button type="submit" className="btn-secondary btn-small" aria-label={`Remove ${c.name}`}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No companies yet.</p>
      )}
    </section>
  );
}
