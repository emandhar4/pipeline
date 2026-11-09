import Link from 'next/link';
import { MatchButtons } from './match-buttons';
import { countBelowBar, getFinderStatus, getMatches } from '@/lib/dashboard/queries';
import {
  finderStale,
  formatUtcDate,
  locationLabel,
  missingList,
  profileCompleteness,
  safeHttpUrl,
} from '@/lib/dashboard/postings';
import { barLine, FIT_SCORE_TITLE, reasonsLine } from '@/lib/scoring/explain';
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

const BADGE =
  'shrink-0 rounded-full bg-accent/10 px-2 py-px text-[11px] leading-4 tracking-wide text-accent';

async function Matches() {
  const [matches, finder, below] = await Promise.all([
    getMatches(),
    getFinderStatus(),
    countBelowBar(),
  ]);
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
          {matches.map((m) => {
            const href = safeHttpUrl(m.apply_url);
            const reasons = reasonsLine(m.reasons);
            const bar = barLine(m.reasons, m.bar_verdict);
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-60">
                  <span className="block font-medium">
                    {href ? (
                      <a
                        href={href}
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
                  <span className="block text-muted">
                    {m.company_name} · {locationLabel(m)}
                  </span>
                  {reasons ? <span className="block text-muted">{reasons}</span> : null}
                  {bar ? <span className="block text-muted">{bar}</span> : null}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {m.base_score !== null ? (
                      <span className={`${BADGE} font-medium tabular-nums`} title={FIT_SCORE_TITLE}>
                        {m.base_score}
                      </span>
                    ) : null}
                    {m.is_new ? <span className={BADGE}>New</span> : null}
                    {m.confirm_pay ? <span className={BADGE}>confirm pay</span> : null}
                    {m.state === 'saved' ? <span className={BADGE}>Saved</span> : null}
                    {m.ai_score !== null ? (
                      <span className={BADGE}>
                        AI fit {m.ai_score}/10
                        {m.reasons.ai_reason ? `: ${m.reasons.ai_reason}` : ''}
                      </span>
                    ) : null}
                  </span>
                </span>
                <MatchButtons matchId={m.id} title={m.title} saved={m.state === 'saved'} />
              </li>
            );
          })}
        </ul>
      )}
      {below > 0 ? (
        <p className="panel-note">
          {below === 1
            ? "1 more matching posting doesn't beat your offer."
            : `${below} more matching postings don't beat your offer.`}
        </p>
      ) : null}
      {stale && finder.lastFinishedAt ? (
        <p className="panel-note">The finder last ran {formatUtcDate(finder.lastFinishedAt)}.</p>
      ) : null}
    </>
  );
}
