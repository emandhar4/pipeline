import { getMatches } from '@/lib/dashboard/queries';
import { getOnboardingState } from '@/lib/onboarding/profile';

export async function PostingsPanel() {
  const [matches, state] = await Promise.all([getMatches(), getOnboardingState()]);
  const primary = state.fields.filter((f) => f.weight === 'primary').map((f) => f.label);

  return (
    <section aria-labelledby="postings-title" className="panel">
      <h2 id="postings-title" className="panel-title">
        New postings worth it
      </h2>
      {matches.length === 0 ? (
        <p className="panel-note">
          Your first search runs when the daily finder goes live.
          {primary.length > 0 ? ` Your fields: ${primary.join(', ')}.` : ''}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {matches.map((m) => (
            <li key={m.id} className="flex items-baseline gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="text-muted">
                  {m.company_name}
                  {m.confirm_pay ? ', confirm pay' : ''}
                </span>
              </span>
              {m.score !== null ? (
                <span className="shrink-0 tabular-nums text-muted">
                  <span className="sr-only">Score </span>
                  {Math.round(m.score)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
