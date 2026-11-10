# Phase 4: Scoring, the Bar and the AI Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every passing posting gets a fit score with reasons you can read in one line, and a held offer becomes a bar. The dashboard's "New postings worth it" panel shows only postings that clear the bar, best first, and lets you save or hide each one. An AI queue lets the owner's Claude cloud routine add a second-opinion fit score to the top few postings without any API key.

**Architecture:**
- Scoring stays in SQL. `refresh_matches(p_user)` (a new version) adds the Phase 4 filters, a 0–100 `base_score`, the bar verdict and machine-readable `reasons`. It runs where it runs today: after each finder run, for every user, and as the user after each profile save. New triggers: saving a bar and changing a company's relation.
- Pure TypeScript in `src/lib/scoring/` turns `reasons` into the one-line text on each card, so the copy is unit-tested and not stored.
- The bar's role is classified into field slugs **when it is saved**, using the finder's pure classifier, so SQL can compare it with the user's fields the same way it compares postings.
- AI stage 1: the finder adds `score_fit` jobs to `ai_jobs` for users whose `profiles.ai_mode = 'queue'` (set only by an admin script). A Claude cloud routine on the owner's plan claims and completes them through two token-protected API routes on Vercel. No Anthropic SDK, key or API call anywhere.

**Tech Stack:** Next.js 16.4, React 19, Tailwind 4, Supabase (Postgres 17, `@supabase/supabase-js` 2.119), zod 4, `tsx`, Vitest 5, Playwright 1.65, GitHub Actions. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§3.1 panel 2, §3.2 steps 3 and 5, §3.4, §4 AI layer and its known risk, §5 `bars`, `user_companies`, `posting_matches`, `ai_jobs`, §6 Phase 4), plus `DECISIONS.md` (Phase 3). **Phase 4 design** below decides what the spec leaves to the builder. The user asked to skip the design questions (2026-11-09), so every item there is Claude's call, listed for the user to check when they review this plan.

## Phase 4 design (Claude's calls, for review)

Data we actually have (hosted DB, 2026-11-09): 12,555 live postings. 974 have pay. 1 has a description snippet. No company has an industry. The one real user has 1 industry preference, no bar, no company relations and 1,631 passing matches. So scoring can lean only on title, fields, company, pay when present, and dates. The description-based signals in the spec (keywords against the experience bank) wait for Phase 6 and the AI queue.

**Filter (hard, adds to Phase 3's `level`, `season`, `place`, `field`):**
- `industry`: the company's industry matches one of the user's `avoid` industries.
- `company`: the user marked the company `rejected`.
- `pay`: pay is known and the posting's best pay (`pay_max`, else `pay_min`) is below the user's pay floor, after converting both to yearly (hour × 2080). Unknown pay passes, with `confirm_pay`.
- `work_auth`: the posting states sponsorship (Simplify's `sponsorship` field, the only source that has it). A user who `needs_sponsorship` fails postings that say `none` or `citizens_only`. A `no_sponsorship_needed` user fails `citizens_only`. Unknown passes.

**Score (0–100, soft; each part is a reason):**

| Part | Points |
|---|---|
| Best matching field is primary / secondary | 40 / 15 |
| Freshness: newer of `posted_date` and `first_seen` is ≤3 / ≤7 / ≤14 / ≤30 days old | 20 / 15 / 10 / 5 |
| Dream company | 20 |
| Preferred industry | 10 |
| Pay known and at or above the floor (or no floor set) | 5 |
| Company marked `capped` (down-ranked, not hidden) | −25 |

The score is clamped to 0–100. `target` relations add nothing; watching is about coverage.

**Industry:** `companies.industry` is filled for S&P 500 companies from the same pinned `constituents.csv` the seed already uses, as `'<GICS Sector> / <GICS Sub-Industry>'`, e.g. `'Industrials / Aerospace & Defense'`. Other companies stay `null`, so no bonus and no exclusion: unknown never excludes. A user's industry label matches when, ignoring case, the label (with a trailing `s` dropped) begins a word in the company's industry string. So `Finance` matches `Financials / ...`, `Tech` matches `Information Technology / ...`, and `Art` matches nothing in `Industrials`. Step two shows a hint under industries: `'Industry is known only for large public companies for now.'`

**Brand:** tier 2 = a dream company; tier 1 = on the S&P 500 list (`companies.is_fortune500`, which this phase sets for S&P rows and documents as meaning "S&P 500", since there is no open Fortune 500 list); tier 0 = anything else, including unknown names.

**The bar** (one per user, optional):
- Compare the posting with the offer on three things:
  - **Function:** the posting's best field weight against the offer role's best field weight, from the role's stored slugs and its text matched against the user's fields with the same rules as postings. Primary beats secondary, and secondary beats no match.
  - **Pay:** better only when the posting's best yearly pay is at least 10% above the offer's yearly pay. Worse when below the offer. Unknown pay on either side means no comparison.
  - **Brand:** tier comparison.
- **"Clearly beats"** = better on at least one of the three and worse on none. Verdict `beats`, otherwise `does_not_beat`. No bar gives `no_bar`.
- **One line on the card:** `'Beats your offer: <better parts>.'` or `'Doesn't beat your offer: <worse parts, or "no clear edge">.'` Parts: `better pay (+18%)`, `stronger brand`, `closer to your fields`, and their opposites `lower pay`, `weaker brand`, `further from your fields`. When pay can't be compared, `confirm_pay` already shows "confirm pay".

**Panel "New postings worth it":** passing, not hidden, not gone, `bar_verdict <> 'does_not_beat'`, sorted by `base_score` desc then `first_seen` desc, top 20. Each card shows:
- the title (apply link), company and location;
- a score badge `'<score>'` titled `'Fit score out of 100'`;
- the reasons line, e.g. `'Primary field: Software Engineering · posted 2 days ago · dream company'`;
- the bar line when a bar exists;
- `New`, `confirm pay` and, when present, `'AI fit <n>/10: <reason>'`;
- **Save** and **Hide** buttons. Saved cards show `Saved`, and a second press un-saves. Hidden ones vanish.

Under the list, when a bar exists and some passing postings do not beat it: `'<n> more matching postings don't beat your offer.'`, or `'1 more matching posting doesn't beat your offer.'` (plain text).

**AI queue (stage 1):**
- Only for users with `profiles.ai_mode = 'queue'`, set by `npx tsx scripts/set-ai-mode.ts <email> queue|off`. Users cannot change that column (Phase 2 grants).
- After `refresh_matches`, the finder enqueues `score_fit` jobs. Candidates are the user's top 15 by `base_score` among passing, non-hidden, non-gone matches that have no `ai_score` and no job yet. At most 15 queued or claimed jobs per user at a time.
- **Worker routes** on Vercel use `Authorization: Bearer $AI_WORKER_TOKEN` (≥ 32 chars), compared in constant time.
  - `POST /api/ai-jobs/claim {limit ≤ 10}` returns jobs with the posting (title, company, locations, apply_url, level, terms, pay) and the user's fields, career stage and season. It returns no name, email, school or resume.
  - `POST /api/ai-jobs/complete {id, score: 1..10, reason ≤ 200 chars}` or `{id, error ≤ 500 chars}`.
  - Claims older than 2 hours can be claimed again.
  - When the token env var is unset, both routes return 404.
  - These two routes are the one exception to "every route handler calls `getCurrentUser()`": their caller is a worker, not a user. The token is their auth. This goes into `CLAUDE.md` and `DECISIONS.md`.
- **The routine** is a Claude cloud routine on the owner's plan, created with the user's OK. It runs daily at 11:30 UTC (after the 10:17 finder). It claims up to 10 jobs; for each, it may read the posting's own apply page, judges fit from 1 to 10 against the user's fields in one sentence, and completes the job. It never applies, never fetches intern-list.com or jobright.ai, and never writes anywhere else.
- The spec's known risk (can a cloud routine reach our backend?) is tested in **Task 1**, before anything depends on it. If it can't, the AI tasks pause and the user decides (stage 2 sooner, or no AI for now). Tasks 2–7 don't depend on it.
- **Stage 2** (`AnthropicProvider`, the API key) stays out of this phase. `// LLM-UPGRADE:` marks where it plugs in.

## Global Constraints

- Branch `phase-4-scoring` from `main` at 5ce8fa8. Commit per task. Never push to `main`. The user opens and merges PRs. Deploy with `vercel --prod` only with the user's OK.
- **Every migration push needs the user's OK.** The user approving this plan covers the migrations listed in it (Tasks 2, 3 and 6). Any other migration needs a new OK. Before each push, run `npx supabase db push --linked --dry-run` and read the output, then push and run `npm run db:types`.
- **No LLM / Anthropic API code, dependency or env var.** `grep -ri anthropic src scripts package.json` hits only `// LLM-UPGRADE:` comments.
- Nothing about the first user is hard-coded. Copy and rules suit any field, stage, region and work authorization.
- No personal data in the repo, in Actions logs or in the routine's prompt. Test fixtures are fictional.
- Never scrape a site whose terms forbid it. Never fetch intern-list.com or jobright.ai. Never auto-apply.
- Free tiers only. No Docker. Nothing depends on the laptop.
- `SUPABASE_SECRET_KEY` only in server-only modules (`import 'server-only'`), `src/finder/`, `scripts/`, and CI/Vercel secrets. `AI_WORKER_TOKEN` only in the worker routes' server-only module, Vercel env and the routine. `src/finder/**` must not be imported from `src/app/**`. `src/lib/scoring/` may import the finder's pure `classify/` modules only.
- Every route handler and server action calls `getCurrentUser()` itself, except the two worker routes (above). App code writes through the user's RLS client.
- Integration tests touch only their own `@example.test` users and test-prefixed global rows (`dedupe_key` `test:`, companies named `Test- ...`). They clean up in `afterAll` and never run real sources. Run integration files one at a time locally.
- e2e runs against a production build: `npm run build && npm run start`, then `npm run test:e2e`. The dev server is too slow in this iCloud folder.
- UI reuses `src/app/globals.css` tokens and classes, works in light and dark, works at 375 px, and follows the frontend-design guidance.
- Use Context7 before writing against Supabase JS/RPC, zod 4, Next 16 route handlers and server actions, and Vitest 5. Read `node_modules/next/dist/docs/` for Next specifics.

## Review Focus

1. **Mixed pay units:** an hourly posting against a yearly floor or offer; `pay_max` null; pay of 0. Conversion is ×2080 both ways, 0 counts as unknown, and the posting is never dropped on a unit mismatch. Test: Task 6 integration cases `hourly posting vs yearly floor` and `zero pay is unknown`.
2. **Partial bars:** a bar with only a company, only pay, or a company not in `companies`. Missing parts are skipped and never count as "worse". A bar with nothing comparable gives `does_not_beat` with `'no clear edge'`. Test: Task 6 `bar with only company`, `bar company unknown`; Task 4 `barLine` table.
3. **Unknown industry or company:** an avoided industry never excludes a company whose industry is null, and an unknown offer company is tier 0. Test: Task 6 `avoid industry ignores unknown industry`.
4. **State survives rescoring:** a saved posting stays saved, and a hidden one stays hidden, across finder runs and profile edits. Hide never deletes. Test: Task 6 `state survives refresh`; Task 7 e2e hide then reload.
5. **Worker route abuse:** no token, a wrong token, an oversized limit, a score of 11, completing an unknown or already-done job, completing someone else's job id format. The response is 401/400/404/409, with no write and no stack trace. Test: Task 8 route tests.

---

### Task 1: Can a Claude cloud routine reach the site? (user's OK first)

**Files:** none in the repo. Record the result in `DECISIONS.md` in Task 9.

- [ ] **Step 1:** Ask the user in one line: "OK to create a one-off Claude cloud routine on your plan that fetches the public login page of pipeline-agent-peach.vercel.app and reports the HTTP status?" Wait for yes. If no: rule that the AI tasks (8, 10) wait, record it, and go on with Tasks 2–7 and 9.
- [ ] **Step 2:** Create it with the `schedule` skill: run once now. Prompt: fetch `https://pipeline-agent-peach.vercel.app/login` with a plain GET and report the status code and the first 100 characters of the body. Nothing else.
- [ ] **Step 3:** Read its run result.
  - `200` → reachable; Tasks 8 and 10 go ahead.
  - Network error or blocked → stop the AI tasks and ask the user: "stage 2 sooner (API key now) or no AI for now?" Tasks 2–7 and 9 go on either way.
- [ ] **Step 4:** Delete the one-off routine. Ledger the result.

---

### Task 2: Schema for scoring and the queue

**Files:**
- Create: `supabase/migrations/20261109000500_scoring_schema.sql`
- Modify: `src/lib/database.types.ts` (regenerated)
- Test: `tests/integration/scoring-schema.test.ts`

**Interfaces:**
- Produces:
  - `postings.sponsorship text` with check `in ('offers','none','citizens_only')`, nullable.
  - `bars`: `unique (user_id)`; `role_field_slugs text[] not null default '{}'`; check `pay_period in ('hour','year')` when not null; check `pay_cents > 0` when not null.
  - `user_companies`: drop `unique (user_id, company_id, relation)` and add `unique (user_id, company_id)`, keeping the oldest row per pair first (0 rows today). `watch_company` keeps working: it inserts `target` only when the user has no row for the company. Restate the function body with that change.
  - `ai_jobs`: `posting_id uuid references public.postings on delete cascade`; unique index `(user_id, kind, posting_id)`; index `(status, claimed_at)`.
  - `posting_matches`: index `(user_id, passed_filter, base_score desc)`.
  - `public.pay_year_cents(cents int, period text) returns int`, immutable. `hour` → cents × 2080, `year` → cents, null or ≤ 0 → null. Execute is granted to `authenticated` and `service_role`.
  - `public.claim_ai_jobs(p_limit int, p_worker text) returns setof public.ai_jobs`, for Task 8. It claims up to `least(p_limit, 10)` rows that are `queued`, or `claimed` with `claimed_at` older than 2 hours. It uses `for update skip locked` and sets `status='claimed'`, `claimed_by`, `claimed_at = now()`. Execute is granted to `service_role` only.

- [ ] **Step 1: Write the failing integration tests:**
  - `a second bar for the same user is refused`;
  - `a bar with pay_period 'week' is refused`;
  - `a user cannot have two relations to one company`;
  - `watch_company on a company the user marked dream keeps dream`;
  - `pay_year_cents(2500,'hour') = 5200000`, `(0,'year') is null`, `(null,'hour') is null`;
  - `an ai_jobs row for another user's id is refused by RLS`;
  - `a duplicate score_fit job for the same posting is refused`;
  - `claim_ai_jobs is not executable by authenticated`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/scoring-schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration.** Dry-run, read it, push (approved with this plan), then `npm run db:types`.
- [ ] **Step 4: Run.** Expected: PASS. `tests/integration/watch-company.test.ts` still passes.
- [ ] **Step 5: Commit** `feat(db): schema for scoring, one bar per user, one relation per company, AI job links`.

---

### Task 3: Industry, S&P flag and sponsorship data

**Files:**
- Modify: `scripts/build-companies-seed.ts` (export `buildIndustryRows(sp500)`; a second output file), `src/finder/sources/simplify.ts`, `src/finder/types.ts` (`NormalizedPosting.sponsorship: 'offers'|'none'|'citizens_only'|null`), `src/finder/sources/build.ts` (default `null` for the ATS adapters), `src/finder/store.ts` (write it; on re-sighting keep the stored value when the new one is null)
- Create: `supabase/migrations/20261109000600_company_industries.sql` (generated: `update public.companies set industry = ..., is_fortune500 = true where normalized_name = public.normalize_company(...)`, one statement per S&P row; header names the pinned SHA and the license)
- Test: `tests/unit/companies-seed.test.ts` (extend), `tests/unit/sources-simplify.test.ts` (extend), `tests/unit/finder-store.test.ts` (extend)

**Interfaces:**
- Produces: `buildIndustryRows(rows: {name: string; sector: string; subIndustry: string}[]): {name: string; industry: string}[]`, where industry is `'<sector> / <subIndustry>'`, rows with an empty sector are dropped, and the result is de-duplicated by name. Simplify mapping, matched ignoring case:
  - `'Does Not Offer Sponsorship'` → `none`;
  - `'U.S. Citizenship is Required'` → `citizens_only`;
  - `'Offers Sponsorship'` → `offers`;
  - anything else or missing → `null`.
  Check the field name and values against the pinned fixture first, and against one live row via the existing live check.

- [ ] **Step 1: Write the failing unit tests:**
  - `buildIndustryRows` formats, drops empty sectors and dedupes;
  - the Simplify adapter maps each sponsorship string and treats a missing field as `null`;
  - the store keeps `'none'` when a later sighting from Greenhouse has `null`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Run the generator, check the update count (≥ 400 rows), dry-run, push (approved with this plan).
- [ ] **Step 4: Run** the unit tests and `npm run typecheck`. Expected: PASS. Then `npx supabase db query --remote --read-only "select count(*) from companies where industry is not null"` returns at least 400.
- [ ] **Step 5: Commit** `feat(finder): company industries from the S&P list, Simplify sponsorship`.

---

### Task 4: Reason and bar text (pure)

**Files:**
- Create: `src/lib/scoring/explain.ts`, `src/lib/scoring/types.ts`
- Test: `tests/unit/scoring-explain.test.ts`

**Interfaces:**
- Produces the `MatchReasons` type, which is the JSON `refresh_matches` writes to `posting_matches.reasons` in Task 6:
  ```ts
  type MatchReasons = {
    fields: { label: string; weight: 'primary' | 'secondary' }[];
    weight: 'primary' | 'secondary' | null;
    location_unknown: boolean;
    age_days: number | null;
    dream: boolean;
    capped: boolean;
    preferred_industry: string | null;
    pay_ok: boolean | null; // null = pay unknown
    bar: null | {
      pay: 'better' | 'same' | 'worse' | null; pay_pct: number | null;
      brand: 'better' | 'same' | 'worse';
      function: 'better' | 'same' | 'worse';
    };
    ai_reason?: string;
  };
  ```
  - `parseReasons(json: unknown): MatchReasons`: zod, lenient. Phase 3 rows that lack the new keys parse with defaults.
  - `reasonsLine(r: MatchReasons): string`: parts joined with `' · '`, in this order: `'Primary field: <first primary label>'` (or `'Secondary field: ...'`), `'posted today'` / `'posted 1 day ago'` / `'posted <n> days ago'` (age ≤ 30 only), `'dream company'`, `'<industry> industry'`, `'capped you this cycle'`.
  - `barLine(r: MatchReasons, verdict: 'beats'|'does_not_beat'|'no_bar'): string | null`: the exact copy in Phase 4 design. `+N%` is rounded.
  - `FIT_SCORE_TITLE = 'Fit score out of 100'`.

- [ ] **Step 1: Write the failing tests:**
  - `reasonsLine` for: primary only; secondary plus 0 days; age 31 omitted; dream plus industry plus capped.
  - `barLine` for:
    - null when `no_bar`;
    - `'Beats your offer: better pay (+18%), stronger brand.'`;
    - `'Doesn't beat your offer: lower pay.'`;
    - `'Doesn't beat your offer: no clear edge.'` (all same or null);
    - function better plus pay null gives `'Beats your offer: closer to your fields.'`.
  - `parseReasons` on the Phase 3 shape `{fields:[],weight:'primary',location_unknown:false}`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scoring-explain.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(scoring): one-line reasons and bar text`.

---

### Task 5: Bar and company relations on Profile

**Files:**
- Create: `src/lib/scoring/bar.ts` (pure: `barSchema`, `roleFieldSlugs`), `src/app/(app)/profile/bar-section.tsx`, `src/app/(app)/profile/bar-actions.ts`
- Modify: `src/app/(app)/profile/page.tsx` (add the "Your bar" section after "What you want", read the bar), `src/app/(app)/profile/companies-section.tsx` and `company-actions.ts` (relation picker), `src/app/(app)/onboarding/step-two-form.tsx` (industry hint copy)
- Test: `tests/unit/scoring-bar.test.ts`, `tests/e2e/profile-bar.spec.ts`

**Interfaces:**
- Consumes: `refreshMyMatches()` from `src/lib/onboarding/profile.ts`; the finder's pure `fieldSlugsFromTitle` (or the current name of the title → field slugs classifier in `src/finder/classify/`); `parsePayFloor` from `src/lib/onboarding/options.ts` for pay input.
- Produces:
  - `barSchema`: zod; `company` ≤ 120, `role` ≤ 120, pay optional (same input rules as the pay floor). At least one of company, role or pay is required. Message: `'Add the company, the role or the pay.'`
  - `roleFieldSlugs(role: string): string[]`.
  - Server actions:
    - `saveBar(prev, formData)` upserts the user's bar with `role_field_slugs`, then refreshes matches;
    - `removeBar()` deletes it, then refreshes;
    - `setCompanyRelation(companyId, relation: 'target'|'dream'|'capped'|'rejected')` updates the user's own row, then refreshes.
    Each calls `getCurrentUser()`.
- UI copy:
  - Bar section:
    - heading `'Your bar'`;
    - intro `'Already holding an offer? Postings must clearly beat it on role, pay or brand to show as worth it.'`;
    - buttons `'Save bar'` and `'Remove bar'`.
  - Relation picker labels: `Watching` (target), `Dream company`, `Capped me`, `Rejected me`. Below it: `'Rejected hides this company's postings. Capped ranks them lower.'`
  - Form keeps its input on error. Errors are announced (same patterns as `companies-section.tsx`).

- [ ] **Step 1: Write the failing unit tests:**
  - `barSchema` refuses an empty bar with the exact message, accepts pay only, and accepts `'$25/hr'`;
  - `roleFieldSlugs('Software Engineer Intern')` contains the software slug, and `roleFieldSlugs('')` is `[]`.
- [ ] **Step 2: Write the failing e2e test:**
  - a test user saves a bar (company `Test- Bar Co`, role, `$30/hr`), reloads and sees it, then removes it;
  - the user marks a watched test company `Dream company`, reloads and sees it kept.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** unit tests, then e2e against a production build. Expected: PASS.
- [ ] **Step 6: Commit** `feat(profile): your bar and company relations`.

---

### Task 6: Scoring in `refresh_matches`

**Files:**
- Create: `supabase/migrations/20261109000700_refresh_matches_scoring.sql` (`create or replace function public.refresh_matches(p_user uuid)`, same signature, grants restated)
- Test: `tests/integration/refresh-matches.test.ts` (extend; all Phase 3 cases keep passing)

**Interfaces:**
- Consumes: Task 2 schema, Task 3 data, the `MatchReasons` shape from Task 4 (keys and values must match exactly).
- Produces: per Phase 4 design, in the same set-based upsert:
  - new filter reasons `industry`, `company`, `pay`, `work_auth`;
  - `base_score` as an integer 0–100 for passing rows and null for failing rows;
  - `bar_verdict`;
  - `reasons` as `MatchReasons` (except `ai_reason`, which it keeps from the old row);
  - `confirm_pay = pay unknown`.
  - It never touches `state` or `ai_score`. The `is distinct from` guard now includes `bar_verdict`.
  - Industry matching follows the label rule in the design. Escape the label as Phase 3 does for free-text fields.
  - Age uses `current_date`.
  - Keep the `// LLM-UPGRADE:` comment on the field test.

- [ ] **Step 1: Write the failing integration cases** (test postings with `test:` keys and test companies; give each fixture an explicit `first_seen`):
  - **Filters:**
    - `avoid industry excludes a company with that industry` and `avoid industry ignores unknown industry`;
    - `rejected company is filtered` and `capped company scores 25 lower`;
    - `hourly posting vs yearly floor`: $20/hr against a $50,000 floor fails `pay`, and $30/hr passes;
    - `zero pay is unknown`: `confirm_pay` is true and the posting passes;
    - `needs_sponsorship fails 'none' and 'citizens_only', passes null`, and `no_sponsorship_needed fails only 'citizens_only'`.
  - **Score:**
    - `score adds up`: a primary field, a 2-day-old posting at a dream company with a preferred industry and pay above the floor gives 40 + 20 + 20 + 10 + 5 = 95;
    - a secondary field on a 40-day-old posting gives 15.
  - **Bar:**
    - `bar beats on pay`: offer $25/hr against a $60,000/yr posting gives `beats` and `pay_pct` 15;
    - `bar loses on brand`: an S&P offer company against an unknown company gives `does_not_beat`;
    - `bar with only company` and `bar company unknown` behave per Review Focus 2;
    - `no bar` gives `no_bar` and `reasons.bar` null.
  - **State:** `state survives refresh`: saved and hidden rows keep their state and `ai_score`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/refresh-matches.test.ts`. Expected: new cases FAIL.
- [ ] **Step 3: Write the migration.** Dry-run, read it, push (approved with this plan).
- [ ] **Step 4: Run.** Expected: PASS. Then add the elapsed time to the finder's existing per-user refresh log line, run `npx tsx scripts/finder.ts --only simplify` once (an ordinary run against the hosted DB), and read the time. It must stay under 10 s per user. Ledger it.
- [ ] **Step 5: Commit** `feat(matching): fit score, Phase 4 filters and the bar verdict`.

---

### Task 7: Dashboard "New postings worth it"

**Files:**
- Modify: `src/lib/dashboard/queries.ts` (`getMatches`, new `countBelowBar`), `src/app/(app)/dashboard/postings-panel.tsx`
- Create: `src/app/(app)/dashboard/match-actions.ts`, `src/app/(app)/dashboard/match-buttons.tsx` (client: Save/Hide with pending state)
- Test: `tests/e2e/dashboard-postings.spec.ts` (extend), `tests/unit/dashboard-postings.test.ts` (extend if helpers change)

**Interfaces:**
- Consumes: `parseReasons`, `reasonsLine`, `barLine` and `FIT_SCORE_TITLE` (Task 4).
- Produces:
  - `MatchRow` gains `base_score: number | null`, `ai_score: number | null`, `bar_verdict`, `reasons: MatchReasons`, `state: 'new'|'saved'|'hidden'|'applied'`.
  - `getMatches(limit = 20)` applies the panel filter and order from Phase 4 design, ordering in SQL (`base_score` desc nulls last, then posting `first_seen` desc, then `id`).
  - `countBelowBar(): Promise<number>`.
  - `setMatchState(matchId: string, state: 'saved'|'new'|'hidden')`: a server action that calls `getCurrentUser()` and updates through the user client (RLS), then `revalidatePath('/dashboard')`. Any other state is refused.
- Copy and layout per Phase 4 design. Card content order: title line; company · location; reasons line; bar line; badges (score, New, confirm pay, Saved, AI fit). The buttons have accessible names `'Save <title>'` / `'Unsave <title>'` and `'Hide <title>'`.

- [ ] **Step 1: Write the failing e2e tests:**
  - **Order:** a test user with three passing test postings sees them in score order with the reasons line.
  - **Bar:** with a bar, the posting that doesn't beat it is absent and `'1 more matching posting doesn't beat your offer.'` shows.
  - **Hide:** Hide removes the card, and it is still gone after a reload.
  - **Save:** Save shows `Saved` after a reload.
  Scope every assertion to the test rows' `<li>`, as Phase 3's spec does.
- [ ] **Step 2: Run** against a production build. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `npm run lint`, `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** `feat(dashboard): postings worth it, by fit score, with save and hide`.

---

### Task 8: AI queue and worker routes (skip if Task 1 says unreachable and the user hasn't chosen)

**Files:**
- Create:
  - `src/finder/ai-queue.ts` (`enqueueScoreFit`)
  - `src/lib/ai/types.ts` (pure: `ScoreFitJob`, `completeSchema`, `claimSchema`)
  - `src/lib/ai/worker.ts` (`import 'server-only'`: token check, claim, complete, using the admin client)
  - `src/app/api/ai-jobs/claim/route.ts`, `src/app/api/ai-jobs/complete/route.ts`
  - `scripts/set-ai-mode.ts`
- Modify:
  - `src/finder/run.ts` (call `enqueueScoreFit` after refresh, for `ai_mode = 'queue'` users; it logs counts only)
  - `src/lib/env.server.ts` (optional `AI_WORKER_TOKEN`, min 32)
  - `scripts/check-bundle-secrets.mjs` (also fail on `AI_WORKER_TOKEN`)
- Test: `tests/unit/ai-types.test.ts`, `tests/integration/ai-queue.test.ts` (enqueue rules, claim and complete against the DB with a test user), `tests/unit/ai-routes.test.ts` (route handlers with the worker module mocked: 401/400/404/409 paths)

**Interfaces:**
- Produces:
  - `enqueueScoreFit(db, userId): Promise<number>`, following the rules in Phase 4 design.
  - `claimJobs(limit): Promise<ScoreFitJob[]>`: calls `claim_ai_jobs` (Task 2), then reads each job's posting and the user's profile fields.
  - `completeJob(input)`: success sets `ai_jobs.status='done'`, `result`, `completed_at`, `posting_matches.ai_score = score` and `reasons.ai_reason = reason` for that user and posting. Error sets `status='failed'` and `error`. It returns 404 for an unknown id and 409 when the job isn't `claimed`.
  - `ScoreFitJob = { id; posting: {title, company, locations, apply_url, level, terms, pay_min_cents, pay_max_cents, pay_period}; profile: {career_stage, season, fields: {label, weight}[]} }`.
  - `// LLM-UPGRADE:` in `src/lib/ai/types.ts`: stage 2 calls the model directly with the same `ScoreFitJob` and `completeSchema`.
- `scripts/set-ai-mode.ts <email> queue|off`: service role, refuses emails ending `@example.test` unless `--test`, prints `ok` only.

- [ ] **Step 1: Write the failing tests:**
  - **Schemas:** `completeSchema` refuses a score of 0 or 11, a reason over 200 characters and extra keys. `claimSchema` caps the limit at 10.
  - **Enqueue:** puts in the top 15 only; doesn't re-enqueue a posting that has a job; skips users whose `ai_mode` isn't `queue`; skips hidden and gone postings.
  - **Claim:** claim twice gives no overlap; a claim older than 2 h is claimable again.
  - **Complete:** sets `ai_score` and `ai_reason`, and `refresh_matches` afterwards keeps both.
  - **Routes:** no or wrong token → 401; token env unset → 404; bad body → 400; unknown id → 404; done job → 409.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add `AI_WORKER_TOKEN` to Vercel production env (generated with `openssl rand -hex 32`, never printed or committed) with the user's OK, together with Task 10.
- [ ] **Step 4: Run** all tests, `node scripts/check-bundle-secrets.mjs` after `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): score_fit queue and token-protected worker routes`.

---

### Task 9: Docs, full checks and the PR

**Files:** `DECISIONS.md` (a "Phase 4" section with every Phase 4 design call, Task 1's result and the open items), `CLAUDE.md` (Where things live: `src/lib/scoring/`, `src/lib/ai/`, worker routes, `set-ai-mode`, and the route-auth exception), spec §3.4 and §4 notes where Phase 4 decided them.

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/check-bundle-secrets.mjs`, the integration files one at a time, and e2e against a production build. Expected: all pass. Record the counts.
- [ ] **Step 3:** Final whole-branch review on the most capable model. One fix wave.
- [ ] **Step 4: Commit** `docs: Phase 4 decisions`. Push the branch, then tell the user it is ready for a PR. Merging and `vercel --prod` need their OK.

---

### Task 10: Turn on the routine (after merge and deploy, user's OK)

- [ ] **Step 1:** With the user's OK:
  - set `AI_WORKER_TOKEN` on Vercel production and redeploy;
  - run `npx tsx scripts/set-ai-mode.ts <owner email> queue` (the email is typed by the user, never committed).
- [ ] **Step 2:** Run the finder once manually (`gh workflow run finder.yml -f only=simplify`), then check that `ai_jobs` has queued rows for the owner (count only).
- [ ] **Step 3:** Create the daily 11:30 UTC routine with the `schedule` skill. Its prompt:
  - the claim/complete contract above, including the token;
  - judge fit from 1 to 10 with one sentence of reason, using the profile fields and the posting (it may open the posting's own apply page);
  - never apply, never fetch intern-list.com or jobright.ai, never write anywhere but `/api/ai-jobs/complete`.
  Run it once now.
- [ ] **Step 4:** Check that some jobs are `done` and that the dashboard shows `AI fit n/10`. Report the counts to the user.
