/** Pure helpers for the "New postings worth it" panel. */

/** Same union as the `remote_kind` enum. Duplicated here: src/app and src/lib never import src/finder. */
export type RemoteKind = 'onsite' | 'hybrid' | 'remote' | 'unknown';

export type MissingItem = 'stage' | 'work_style' | 'places' | 'primary_field' | 'season';

type CompletenessProfile = {
  career_stage: string | null;
  work_style: string | null;
  work_states: string[];
  work_anywhere_us: boolean;
  work_countries: string[];
  season: string | null;
};

/**
 * Mirrors the "incomplete profile" rules of the SQL function `refresh_matches`: a null stage,
 * null work style, blank season, no primary field, or no places (unless `remote_only`) means
 * the user gets no matches. "No places" never means anywhere.
 */
export function profileCompleteness(
  p: CompletenessProfile,
  fields: { weight: string }[],
): { complete: true } | { complete: false; missing: MissingItem[] } {
  const missing: MissingItem[] = [];
  if (p.career_stage === null) missing.push('stage');
  if (p.work_style === null) missing.push('work_style');
  const hasPlaces =
    p.work_anywhere_us || p.work_states.length > 0 || p.work_countries.length > 0;
  if (p.work_style !== null && p.work_style !== 'remote_only' && !hasPlaces) missing.push('places');
  if (!fields.some((f) => f.weight === 'primary')) missing.push('primary_field');
  if (p.season === null || p.season.trim() === '') missing.push('season');
  return missing.length === 0 ? { complete: true } : { complete: false, missing };
}

const MISSING_LABELS: Record<MissingItem, string> = {
  stage: 'career stage',
  work_style: 'work style',
  places: 'where you can work',
  primary_field: 'a primary field',
  season: 'season',
};

export function missingList(missing: MissingItem[]): string {
  return missing.map((m) => MISSING_LABELS[m]).join(', ');
}

export function locationLabel(m: {
  locations: string[];
  remote: RemoteKind;
  location_unknown: boolean;
}): string {
  if (m.location_unknown) return 'Location not listed';
  if (m.locations.length === 0) return m.remote === 'remote' ? 'Remote' : 'Location not listed';
  const extra = m.locations.length - 1;
  return extra > 0 ? `${m.locations[0]} +${extra}` : m.locations[0];
}

const STALE_AFTER_MS = 36 * 3_600_000;

/** True when the latest finished run is over 36 hours old, or there is none. */
export function finderStale(lastFinishedAt: string | null, now: Date): boolean {
  if (lastFinishedAt === null) return true;
  return now.getTime() - new Date(lastFinishedAt).getTime() > STALE_AFTER_MS;
}

const utcDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatUtcDate(iso: string): string {
  return utcDate.format(new Date(iso));
}

/** Returns the URL only when it parses with an http: or https: protocol, else null. */
export function safeHttpUrl(u: string | null): string | null {
  if (u === null) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}
