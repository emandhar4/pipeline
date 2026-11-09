import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getCompanyCoverage, getLatestRun } from '@/lib/coverage/queries';
import { failedScopes, summarizeRun } from '@/lib/coverage/summary';

export const metadata: Metadata = { title: 'Coverage · Pipeline' };

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const when = (iso: string) => `${fmt.format(new Date(iso))} UTC`;

async function CoverageContent() {
  await getCurrentUser();
  const [run, companies] = await Promise.all([getLatestRun(), getCompanyCoverage()]);
  const sources = run ? summarizeRun(run.items) : [];
  const problems = run ? failedScopes(run.items) : [];
  const totals = sources.reduce((t, s) => ({ found: t.found + s.found, new: t.new + s.new }), { found: 0, new: 0 });

  return (
    <div className="space-y-10">
      <section aria-labelledby="run-title" className="panel">
        <h2 id="run-title" className="panel-title">
          Latest run
        </h2>
        {!run ? (
          <p className="panel-note">The finder hasn&apos;t run yet.</p>
        ) : (
          <>
            <p className="panel-note">
              Started {when(run.started_at)}
              {run.finished_at ? `, finished ${when(run.finished_at)}` : ', not finished'}. Status: {run.status}.{' '}
              {totals.found} postings found, {totals.new} new.
            </p>
            {sources.length === 0 ? (
              <p className="panel-note">No sources were recorded for this run.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="px-3 py-2 text-right font-medium">Scopes</th>
                      <th className="px-3 py-2 text-right font-medium">Read</th>
                      <th className="px-3 py-2 text-right font-medium">Failed</th>
                      <th className="px-3 py-2 text-right font-medium">Skipped</th>
                      <th className="px-3 py-2 text-right font-medium">Found</th>
                      <th className="py-2 pl-3 text-right font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sources.map((s) => (
                      <tr key={s.source}>
                        <th scope="row" className="py-2 pr-3 font-medium">
                          {s.source}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{s.scopes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.ok}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.failed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.skipped}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.found}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{s.new}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {run ? (
        <section aria-labelledby="cant-read-title" className="panel">
          <h2 id="cant-read-title" className="panel-title">
            Couldn&apos;t read
          </h2>
          {problems.length === 0 ? (
            <p className="panel-note">Every source was read in full.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {problems.map((p) => (
                <li key={`${p.source}/${p.scope}`} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium break-all">{p.scope}</span>
                    <span className="text-muted">
                      {p.source}, {p.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted break-words">{p.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="companies-title" className="panel">
        <h2 id="companies-title" className="panel-title">
          Companies
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted">Covered</dt>
            <dd className="text-lg font-medium tabular-nums">{companies.covered}</dd>
          </div>
          <div>
            <dt className="text-muted">Not covered</dt>
            <dd className="text-lg font-medium tabular-nums">{companies.not_covered}</dd>
          </div>
          <div>
            <dt className="text-muted">Unchecked</dt>
            <dd className="text-lg font-medium tabular-nums">{companies.unknown}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export default function CoveragePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-xl font-medium">Coverage</h1>
      <p className="panel-note">What the daily finder read in its latest run, and what it couldn&apos;t.</p>
      <div className="mt-8">
        <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" />}>
          <CoverageContent />
        </Suspense>
      </div>
    </main>
  );
}
