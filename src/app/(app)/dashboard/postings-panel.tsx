import Link from 'next/link';
import { getFinderStatus, getMatches } from '@/lib/dashboard/queries';
import {
  finderStale,
  formatUtcDate,
  locationLabel,
  missingList,
  profileCompleteness,
} from '@/lib/dashboard/postings';
import { getOnboardingState } from '@/lib/onboarding/profile';

export async function PostingsPanel() {
  const state = await getOnboardingState();
  const completeness = profileCompleteness(state.profile, state.fields);

  return (
    <section aria-labelledby="postings-title" className="panel">
      <h2 id="postings-title" className="panel-title">
        New postings worth it
      </h2>
      {completeness.complete ? <Matches /> : (
        <p className="panel-note">
          <Link href="/profile" className="underline underline-offset-2">
            Finish your profile to see matching postings: {missingList(completeness.missing)}.
          </Link>
        </p>
      )}
    </section>
  );
}

async function Matches() {
  const [matches, finder] = await Promise.all([getMatches(), getFinderStatus()]);
  const stale = finder.lastFinishedAt !== null && finderStale(finder.lastFinishedAt, new Date());

  return (
    <>
      {matches.length === 0 ? (
        <p className="panel-note">
          {finder.lastFinishedAt === null
            ? 'Your first search runs when the daily finder goes live.'
            : 'No matching postings yet. The finder checks every morning.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {matches.map((m) => (
            <li key={m.id} className="flex items-baseline gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.apply_url ? (
                    <a
                      href={m.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                </span>
                <span className="text-muted">
                  {m.company_name}, {locationLabel(m)}
                  {m.confirm_pay ? ', confirm pay' : ''}
                </span>
              </span>
              {m.is_new ? (
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-px text-[11px] leading-4 tracking-wide text-accent">
                  New
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {stale && finder.lastFinishedAt ? (
        <p className="panel-note">The finder last ran {formatUtcDate(finder.lastFinishedAt)}.</p>
      ) : null}
    </>
  );
}
