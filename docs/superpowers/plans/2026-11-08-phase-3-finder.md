# Phase 3: Daily Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A finder that runs daily on GitHub Actions, collects internship and new-grad postings from every allowed source, filters them per user, and puts each user's matches on the dashboard. The first run's per-source numbers go to the user before the daily schedule is switched on.

**Architecture:**
- The finder is plain TypeScript in `src/finder/`, run by `tsx` from `scripts/finder.ts` on GitHub Actions (Node 24) with the service key. It never imports `server-only` or Next code.
- Each source is an adapter that returns normalized postings for one **scope**. A scope is the unit that succeeds or fails as a whole: `simplify:intern`, `simplify:newgrad`, or `<ats>:<token>` for one company board. Pure classifiers in `src/finder/classify/` derive level, terms, US states, country, remote and field slugs from the raw text at ingest, and store them on `postings`.
- Matching is one SQL function, `refresh_matches(p_user)`. It compares those derived columns with the profile using set operations. The finder calls it for every user after a run. The app calls it as the user right after the profile is saved, so a new user sees matches without waiting a day.
- Global writes (`companies`, `postings`, `posting_sources`, `finder_runs`, `finder_run_items`) stay service-role only. The one user-facing write path into `companies` is the `watch_company` RPC (security definer, bounded).

**Tech Stack:** Next.js 16.4, React 19, Tailwind 4, Supabase (Postgres 17, `@supabase/supabase-js` 2.119), zod 4, `tsx`, Vitest 5, Playwright 1.65, GitHub Actions. No new runtime dependencies (use global `fetch`, `node:crypto`).

**Spec:** `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§3.3 finder, §3.4 filter only, §4, §5 global tables, §6 Phase 3), plus `DECISIONS.md` ("Daily finder", "Coverage", "Dashboard", "Phase 3 decisions (open)", "Phase 2b"). The decisions in **Phase 3 design** below override the spec where they differ.

## Phase 3 design (agreed with the user 2026-11-08)

Sources, as vetted on 2026-11-08 (full notes: the session's `phase3-sources.md`; summary goes to `DECISIONS.md` in Task 12):

| Source | Status | How it is read |
|---|---|---|
| SimplifyJobs/Summer2027-Internships, SimplifyJobs/New-Grad-Positions | **Use** | One GET each of raw `.github/scripts/listings.json` on branch `dev` (~13 MB). Keep rows with `active && is_visible`. `url` is the employer apply link. No LICENSE file: store our normalized rows, link to the employer, never republish the file. Tech categories only. |
| Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable | **Use** | Documented public job-board JSON endpoints, one company board per scope. |
| Workday | **Use, low volume** (user's call) | Only companies whose Workday careers link is known (a user pasted it). Undocumented `cxs` POST, `searchText` `intern` then `graduate`, at most 3 pages of 20 each, 1 request per 2 s per host, skipped if the tenant's robots.txt disallows `/wday/`. |
| intern-list.com, jobright-ai repos | **Dropped** | Run by Jobright, whose terms (updated 2026-07-29) forbid "scraping, harvesting, or redistributing job or employer data". Apply links route through jobright.ai. This reverses the spec's §3.3 source list. |
| LinkedIn, Handshake | **Never** | Terms / login wall. The user keeps checking them by hand; Phase 5 import covers what they applied to there. |

Watchlist seed: the MIT-licensed `Gsync/jobsync` directories (`src/lib/scraper/{greenhouse,lever,ashby}/companies.json`, ~5,400 boards) plus the public-domain (ODC PDDL) S&P 500 `datasets/s-and-p-500-companies` `data/constituents.csv` as the "big employers" list, with HQ state as `regions`. There is no open Fortune 500 list. Users add more companies **by name** on Profile, with an optional careers link as a fallback.

Product rules:
- **Goal is coverage:** never miss a role worth applying to. The dashboard shows each user's matching roles starting in Phase 3. Phase 4 adds the fit score and the bar.
- **Keep early-career roles from every company** (`level` `internship` or `new_grad`). Experienced or unknown-level roles are kept only from companies some user watches (`user_companies`). This bounds database size under the 500 MB free tier.
- **Phase 3 filter** = level vs career stage, season, places vs work style, fields. Avoided industries, capped/rejected companies, pay floor and work authorization filtering are Phase 4. `confirm_pay` is set when the posting has no pay.
- **Incomplete profile** (null `career_stage`, null `work_style`, no places unless `remote_only`, no primary field, or null `season`) gets no new matches. The dashboard asks the user to finish the profile. It never reads "no places" as "anywhere".
- **A posting with no parsable location passes the place filter** with reason `location_unknown` (never miss), shown as "Location not listed".
- **A failed scope is recorded as failed with a reason, never as 0 found, and never marks its postings gone.**
- **First run is manual.** The workflow ships with `workflow_dispatch` only. The cron is added in Task 13, after the user has seen the first run's numbers and said yes.

Builder calls (record in `DECISIONS.md` in Task 12):
- Dedupe key: `canonicalJobKey(applyUrl)` when the URL is a recognizable ATS job (`greenhouse:<token>:<id>`, `lever:<site>:<id>`, `ashby:<board>:<id>`, `workday:<host>:<path>`, …), else `h:` + sha1 of `normalizeCompany|normalizeTitle|locationKey`. This joins the same job found in Simplify and on the company's own board.
- Status: a posting is `new` in the run that first inserts it, `seen` from the next run, `gone` when every `posting_sources` row for it is gone. A source row goes gone when its scope succeeded in a run and did not return it (or Simplify says `active=false`).
- Retention: `gone` postings with `last_seen` older than 60 days are deleted unless a `posting_matches` row for them has state `saved` or `applied`. `finder_run_items` older than 30 days are deleted; `finder_runs` are kept.
- Polite fetch: user agent `PipelineFinder/1.0 (+https://github.com/emandhar4/pipeline)`; per-host spacing 500 ms (Lever 1000 ms per its Crawl-delay, Workday 2000 ms); retries on 429/5xx/network errors with backoff 2 s, 8 s, 30 s (honoring `Retry-After` up to 60 s); 30 s timeout per request; then the scope is `failed` with the status code or error.
- Resolver budget: at most 150 `unknown` companies probed per run.
- Public repo: Actions logs are public. The finder logs counts, sources and company names only, never user ids, emails or profile data.
- Scheduled workflows on a public repo pause after 60 days without repo activity. The dashboard shows "The finder last ran <date>" when the latest finished run is over 36 hours old.

## Global Constraints

- Branch `phase-3-finder` (from `main` at 954908f). Commit per task. Never push to `main`. The user opens and merges PRs. Deploy with `vercel --prod` only with the user's OK.
- **No LLM / Anthropic API code, dependency or env var.** `grep -ri anthropic src scripts package.json` hits only `// LLM-UPGRADE:` comments. Mark at least: title → field classification (`src/finder/classify/fields.ts`) and the matcher's field test (`refresh_matches`).
- Nothing about the first user is hard-coded. Keyword maps and copy suit any field, stage and region.
- No personal data in the repo or in Actions logs. Test fixtures are fictional JSON with the real shapes.
- Never scrape a site whose terms forbid it. Never fetch intern-list.com or jobright.ai. Never auto-apply.
- Free tiers only. No paid service, no Docker. Nothing depends on the laptop: the finder runs on GitHub Actions, data in hosted Supabase.
- `SUPABASE_SECRET_KEY` only in `scripts/finder.ts` / `src/finder/` (run by tsx, never imported by `src/app`), `src/lib/supabase/admin.ts`, and CI/Vercel secrets. Guard: `src/finder/**` must not be imported from `src/app/**` (checked in Task 7's test by grepping imports).
- Every route handler and server action calls `getCurrentUser()` itself. App code writes through the user's RLS client.
- The finder does not read `resumes`. Any later service-role job that reads `resumes.storage_path` must re-check `isOwnResumePath(user_id, path)`.
- Migrations target the hosted project, which holds real data. `npx supabase db push --linked --dry-run`, read it, then push (check flags with `--help`, CLI 3.0). `npm run db:types` after each schema change.
- Integration tests touch only their own `@example.test` users and, for global tables, only rows they create: `dedupe_key` starting `test:`, `posting_sources.source = 'test'`, `companies.normalized_name` starting `test-`, `finder_runs.trigger = 'test'`. Delete them in `afterAll`. Never run real sources in tests. Run integration files one at a time locally.
- UI reuses `src/app/globals.css` tokens and classes, light and dark, works at 375 px, follows the frontend-design guidance.
- Use Context7 before writing against Supabase JS/RPC, zod 4, Next 16 server actions, Vitest 5. Read `node_modules/next/dist/docs/` for Next specifics.

## Review Focus

1. **A source that fails half-way** (Greenhouse 429 storm, Simplify file truncated or not JSON, a board renamed and now 404): the scope is `failed` with a reason, its postings stay `seen`, and the run still finishes and calls `refresh_matches`. Test: Task 7 `runFinder` with a failing fake source; Task 1 `finish_finder_run` integration case.
2. **The first user's real profile shapes**: `work_style` null (pre-0850), `remote_only` with no places, "Anywhere in the US" with empty `work_states`, only free-text fields (no category), season `Full-time` with stage `intern`. Each gets the documented result, never "matches everywhere". Test: Task 8 integration cases.
3. **Messy location strings**: "Remote in USA", "New York, NY / San Francisco, CA", "Hybrid - Austin, TX", "London, UK", "US", "Multiple Locations", "". Test: Task 2 `parseLocation` table.
4. **The same job from Simplify and the company's board** (URL with tracking query string, `job-boards.greenhouse.io` vs `boards.greenhouse.io`): one posting with two source rows. Test: Task 2 `canonicalJobKey` and Task 7 store test.
5. **A user typing a company that doesn't resolve** ("Deloitte" on Workday, a typo, "Inc." suffix, 101st company, a forged careers link like `javascript:` or a non-ATS host): a clear "not covered" reason or validation message, never a crash, never another user's company row overwritten. Test: Task 6 `parseCareersUrl`, Task 10 `watch_company` integration.

---

### Task 1: Schema for the finder

**Files:**
- Create: `supabase/migrations/20261109000100_finder.sql`
- Modify: `src/lib/database.types.ts` (regenerated)
- Test: `tests/integration/finder-schema.test.ts`

**Interfaces:**
- Produces (columns):
  - `postings`: `states text[] not null default '{}'` (USPS codes), `countries text[] not null default '{}'` (ISO-2), `terms text[] not null default '{}'` (e.g. `Summer 2027`), `field_slugs text[] not null default '{}'`, `location_unknown boolean not null default false`. GIN indexes on `states`, `field_slugs`; btree on `(status, level)`.
  - `posting_sources`: `scope text not null`, `gone_at timestamptz`; index `(scope) where gone_at is null`.
  - `finder_run_items`: `scope text not null`, `found int not null default 0` (rename nothing; `fetched` stays as raw rows read).
  - `finder_runs`: `status text not null default 'running' check (status in ('running','finished','failed'))`.
  - `companies`: `watchers int not null default 0` (maintained by trigger on `user_companies`), `careers_url text`, `resolved_at timestamptz`.
- Produces (functions, `security definer`, `set search_path = ''`, execute granted to `service_role` only):
  - `finish_finder_run(p_run uuid) returns jsonb` — for scopes with an `ok` item in this run: source rows with `last_seen < run.started_at` get `gone_at = now()`; postings with no live source row become `gone`; postings with `status='new' and first_seen < run.started_at` become `seen`; sets `finder_runs.finished_at`, `status='finished'`, `totals`. Returns the totals `{found, new, seen, gone, failed_scopes}`.
  - `prune_finder_data() returns jsonb` — the retention rules from the design.

- [ ] **Step 1: Write the failing integration tests** (`describe('finder schema')`, test rows per Global Constraints):
  - `finish marks unseen rows of an ok scope gone`: posting P with source row scope `test:a` last_seen yesterday; run R (started now) with an `ok` item for `test:a`; `finish_finder_run(R)` → P.status `gone`, source `gone_at` not null.
  - `failed scope keeps its postings`: same, item status `failed` → P.status unchanged, `gone_at` null.
  - `new becomes seen on the next run`: P inserted before R with status `new` → `seen`.
  - `a second live source keeps a posting alive`: P has rows in `test:a` (unseen) and `test:b` (seen this run), both ok → P not gone.
  - `prune keeps saved matches`: gone posting with last_seen 61 days ago and a `saved` match survives; one without is deleted.
  - `authenticated cannot execute finder functions`: user client `rpc('finish_finder_run')` errors.
- [ ] **Step 2: Run** `npx vitest run tests/integration/finder-schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration.** Revoke execute from `public, anon, authenticated` explicitly. The `watchers` trigger counts `user_companies` rows per `company_id` on insert/delete/update.
- [ ] **Step 4: Dry-run, read, push** (`npx supabase db push --linked --dry-run`, then without `--dry-run`), then `npm run db:types`.
- [ ] **Step 5: Run** the test file. Expected: PASS. `npm run typecheck` passes.
- [ ] **Step 6: Commit** `feat(finder): schema for scopes, derived posting columns and run finishing`.

---

### Task 2: Classifiers (pure)

**Files:**
- Create: `src/finder/classify/location.ts`, `level.ts`, `terms.ts`, `fields.ts`, `keys.ts`, `index.ts`, `src/lib/companies/normalize.ts`
- Test: `tests/unit/finder-classify.test.ts`

**Interfaces:**
- Consumes: `stateFromLocation`, `isUsState`, `US_STATES`, `COUNTRIES` from `src/lib/onboarding/regions.ts`.
- Produces:
  - `parseLocation(text: string): { state: UsState | null; country: string | null; remote: boolean }` and `parseLocations(texts: string[]): { states: UsState[]; countries: string[]; remote: RemoteKind; unknown: boolean }` where `RemoteKind = 'onsite' | 'hybrid' | 'remote' | 'unknown'`. A US state implies country `US`. `unknown` is true when no state, no country and not remote.
  - `classifyLevel(title: string, hints?: { commitment?: string; employmentType?: string; simplify?: 'intern' | 'newgrad' }): JobLevel` (`'internship' | 'new_grad' | 'experienced' | 'unknown'`).
  - `termsFromText(text: string): string[]` → normalized `"<Season> <YYYY>"` (Seasons: Spring, Summer, Fall, Winter; "Autumn" → Fall).
  - `fieldSlugsFromTitle(title: string, simplifyCategory?: string): string[]` using `TITLE_FIELD_KEYWORDS: Record<string, string[]>` covering all 21 `field_categories` slugs (Task-local constant, separate from the resume map; titles are short, so keywords are role words like `analyst`, `accounting`, `recruit`, `supply chain`). `// LLM-UPGRADE:` comment on this function.
  - `normalizeCompany(name: string): string` in `src/lib/companies/normalize.ts` (pure, shared with the app; re-exported from `src/finder/classify/index.ts`) (lowercase, strip punctuation and suffixes `inc`, `llc`, `ltd`, `corp`, `corporation`, `co`, `company`, `plc`, `group`, `holdings`; collapse spaces) and `normalizeTitle(title: string): string`.
  - `canonicalJobKey(url: string): string | null` and `dedupeKey(p: { applyUrl: string | null; company: string; title: string; states: string[]; remote: RemoteKind }): string`.

- [ ] **Step 1: Write the failing tests** (table-driven):
  - `parseLocation`: `'San Francisco, CA'`→`{state:'CA',country:'US',remote:false}`; `'Remote in USA'`→`{state:null,country:'US',remote:true}`; `'Hybrid - Austin, TX'`→`{state:'TX',country:'US',remote:false}`; `'London, UK'`→`{state:null,country:'GB',remote:false}`; `'Toronto, ON, Canada'`→country `'CA'`, state null; `'US'`→country `'US'`; `'Multiple Locations'` and `''`→all null/false.
  - `parseLocations(['New York, NY / San Francisco, CA'])` → states `['CA','NY']` (split on ` / `, `;`, ` or `), remote `onsite`; `parseLocations(['Hybrid - Austin, TX'])` → remote `hybrid`; `parseLocations([])` → `unknown: true`.
  - `classifyLevel`: `'Software Engineer Intern'`→internship; `'Co-op, Finance (Fall 2027)'`→internship; `'New Grad Software Engineer 2027'`→new_grad; `'Analyst, Early Careers Program'`→new_grad; `'University Graduate - Data Scientist'`→new_grad; `'Senior Product Manager'`→experienced; `'Internal Audit Manager'`→experienced (not internship: "Internal" must not match); `'Business Analyst'`→unknown; hint `employmentType:'Intern'`→internship; `simplify:'newgrad'`→new_grad.
  - `termsFromText`: `'Summer 2027 Intern'`→`['Summer 2027']`; `'Intern (2027 Summer)'`→`['Summer 2027']`; `'Fall/Winter 2026 Co-op'`→`['Fall 2026','Winter 2026']`; `'Intern'`→`[]`.
  - `fieldSlugsFromTitle`: `'Accounting Intern'`⊇`['accounting-and-finance']`; `'Business Analyst Intern'`⊇`['business-analyst']`; `'Supply Chain Analyst, New Grad'`⊇`['supply-chain']`; `'Software Engineer Intern'`⊇`['software-engineering']`; `('Intern', 'AI/ML/Data')`⊇`['machine-learning-and-ai']`; every key of `TITLE_FIELD_KEYWORDS` is one of the 21 slugs (list them in the test).
  - `canonicalJobKey`: `'https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x'` and `'https://boards.greenhouse.io/acme/jobs/123'` → both `'greenhouse:acme:123'`; `'https://jobs.lever.co/acme/1a2b-…/apply'`→`'lever:acme:1a2b-…'`; `'https://jobs.ashbyhq.com/acme/uuid'`→`'ashby:acme:uuid'`; `'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Intern_R123'`→`'workday:acme.wd5:external/job/austin-tx/intern_r123'`; `'https://example.test/careers'`→`null`.
  - `dedupeKey`: same company with `Inc.` and different case/punctuation and same title/states → equal keys starting `h:`; different states → different keys; an ATS URL → the canonical key.
  - `normalizeCompany('Acme, Inc.')` === `normalizeCompany('ACME Corporation')` === `'acme'`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/finder-classify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules. Use word-boundary regexes (`\bintern(ship)?s?\b`, `\bco-?op\b`, `\bnew grad`, `\bearly career`, `\buniversity grad`, `\bentry[- ]level\b`; experienced: `\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp)\b`). Country names map through `COUNTRIES` + `Intl.DisplayNames` reverse lookup plus aliases `USA`, `United States`, `U.S.`, `UK`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(finder): location, level, term, field and dedupe classifiers`.

---

### Task 3: Polite HTTP client

**Files:**
- Create: `src/finder/http.ts`
- Test: `tests/unit/finder-http.test.ts`

**Interfaces:**
- Produces:
  - `type FetchResult<T> = { ok: true; data: T; status: number } | { ok: false; reason: string; status?: number }`.
  - `createHttp(opts?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; spacingMs?: Record<string, number> }): Http`.
  - `Http.getJson<T>(url: string): Promise<FetchResult<T>>`, `Http.postJson<T>(url: string, body: unknown): Promise<FetchResult<T>>`, `Http.getText(url: string): Promise<FetchResult<string>>`, `Http.robotsAllows(url: string): Promise<boolean>` (cached per host; a missing robots.txt allows; parses `User-agent: *` groups' `Disallow` prefixes only).
  - `USER_AGENT = 'PipelineFinder/1.0 (+https://github.com/emandhar4/pipeline)'`.

- [ ] **Step 1: Write the failing tests** with a fake `fetchImpl` and a recording `sleep`:
  - `sends the user agent` on every request.
  - `spaces requests per host`: two GETs to the same host → second waits ≥ 500 ms; different hosts → no wait. `api.lever.co` → 1000 ms; `*.myworkdayjobs.com` → 2000 ms.
  - `retries 429 then succeeds`: 429, 429, 200 → ok, sleeps 2000 then 8000; with `Retry-After: 5` → sleeps 5000.
  - `gives up after 3 retries`: four 503 → `{ ok:false, status:503, reason:'HTTP 503 after 3 retries' }`.
  - `404 is not retried`: → `{ ok:false, status:404, reason:'HTTP 404' }`.
  - `bad JSON is a failure, not empty`: 200 with body `<html>` → `{ ok:false, reason:'invalid JSON' }`.
  - `robotsAllows`: `Disallow: /wday/` blocks `https://x.wd1.myworkdayjobs.com/wday/cxs/x/y/jobs`; 404 robots → true.
- [ ] **Step 2: Run** `npx vitest run tests/unit/finder-http.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with a per-host promise chain for spacing and `AbortSignal.timeout(30_000)`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(finder): polite HTTP client with spacing, retries and robots check`.

---

### Task 4: Source adapters

**Files:**
- Create: `src/finder/types.ts`, `src/finder/sources/simplify.ts`, `greenhouse.ts`, `lever.ts`, `ashby.ts`, `smartrecruiters.ts`, `recruitee.ts`, `workable.ts`, `workday.ts`, `index.ts`
- Create: `tests/fixtures/finder/*.json` (fictional, real shapes, 3–6 rows each, including one closed/unlisted row and one experienced row)
- Test: `tests/unit/finder-sources.test.ts`

**Interfaces:**
- Consumes: `Http` (Task 3), classifiers (Task 2).
- Produces (`types.ts`):
  - `type NormalizedPosting = { externalId: string; company: string; title: string; locations: string[]; states: string[]; countries: string[]; remote: RemoteKind; locationUnknown: boolean; applyUrl: string | null; sourceUrl: string | null; postedDate: string | null /* YYYY-MM-DD */; payMinCents: number | null; payMaxCents: number | null; payPeriod: 'hour' | 'year' | null; terms: string[]; level: JobLevel; fieldSlugs: string[]; active: boolean }`.
  - `type ScopeResult = { scope: string; source: string; companyId: string | null; status: 'ok' | 'failed' | 'skipped'; reason?: string; fetched: number; postings: NormalizedPosting[] }`.
  - `type BoardCompany = { id: string; name: string; ats: AtsKind; token: string; meta: Record<string, unknown> }`.
  - `fetchSimplify(http: Http, kind: 'intern' | 'newgrad'): Promise<ScopeResult>` (scope `simplify:intern` / `simplify:newgrad`, source `simplify`).
  - `fetchBoard(http: Http, company: BoardCompany): Promise<ScopeResult>` dispatching on `ats` (scope `<ats>:<token>`, source = ats).
  - `BOARD_URLS` per ATS (URLs from the design table): Greenhouse `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?pay_transparency=true` (no `content`); Lever `https://api.lever.co/v0/postings/{token}?mode=json` (`meta.region === 'eu'` → `api.eu.lever.co`); Ashby `https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true`; SmartRecruiters `https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset=N`; Recruitee `https://{token}.recruitee.com/api/offers/`; Workable `https://apply.workable.com/api/v1/widget/accounts/{token}`; Workday `POST https://{meta.host}/wday/cxs/{meta.tenant}/{meta.site}/jobs`.

- [ ] **Step 1: Write the failing tests**, one `describe` per adapter, fed fixtures through a fake `Http`:
  - Simplify: drops rows with `active:false` or `is_visible:false` (they come back with `active:false` so the store can mark them gone); `date_posted` unix seconds → `YYYY-MM-DD`; `terms` copied; `url` becomes `applyUrl`; `category` passed to `fieldSlugsFromTitle`; level from `kind`.
  - Greenhouse: `location.name` parsed; `absolute_url` is `applyUrl`; `first_published` → `postedDate`; pay from `pay_input_ranges` (cents, period from `unit`) when present.
  - Lever: `text` is the title; `categories.commitment: 'Intern'` → internship; `workplaceType: 'remote'` → remote; `createdAt` ms → date.
  - Ashby: `isListed:false` rows skipped; `secondaryLocations` merged; `employmentType: 'Intern'` → internship.
  - SmartRecruiters: follows `offset` until `totalFound` reached (cap 10 pages).
  - Workday: posts `{appliedFacets:{},limit:20,offset:N,searchText}` for `intern` then `graduate`, stops at 3 pages each or when a page has < 20; `postedOn` "Posted 26 Days Ago" → date 26 days before the injected `now`; "Posted Today" → today; dedupes by `externalPath`; robots disallow → `status:'skipped', reason:'robots.txt disallows'`.
  - Any adapter: HTTP failure → `status:'failed'` with the HTTP reason and `postings: []`; a 200 whose top-level shape is wrong (e.g. Greenhouse without `jobs` array) → `failed`, reason `unexpected response shape`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/finder-sources.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the adapters. Validate top-level shapes with zod (loose objects, only fields used). Snippet stays null in Phase 3 (no `content` fetch).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(finder): Simplify and ATS board adapters`.

---

### Task 5: Company watchlist seed

**Files:**
- Create: `scripts/build-companies-seed.ts`, `supabase/migrations/20261109000200_seed_companies.sql` (generated)
- Modify: `THIRD_PARTY_NOTICES.md` (jobsync MIT notice; S&P 500 dataset PDDL note), `CLAUDE.md` (seed generator line)
- Test: `tests/unit/companies-seed.test.ts`

**Interfaces:**
- Consumes: `normalizeCompany` (Task 2), `sqlLiteral`/helpers from `scripts/seed-sql.ts`.
- Produces: `buildCompanyRows(input: { greenhouse: {name:string;token:string}[]; lever: …; ashby: …; sp500: { name: string; hqState: string | null }[] }): CompanyRow[]` exported from the script module, where `CompanyRow = { name; normalized_name; ats; ats_token; regions: string[]; coverage: 'covered' | 'unknown' }`. ATS rows are `covered`; S&P rows that match no ATS row are `ats:'unknown', coverage:'unknown'` with `regions = [hqState]`.
- The migration uses `insert … on conflict (normalized_name) do nothing` so re-running never overwrites resolved rows.
- Usage: `npx tsx scripts/build-companies-seed.ts` (downloads the four public files at pinned commit SHAs recorded in the script header, writes the migration).

- [ ] **Step 1: Write the failing tests**: duplicate names across ATS lists keep the first by order greenhouse, lever, ashby; an S&P name that normalizes to an ATS row adds its HQ state to that row's `regions` instead of a new row; `'Apple Inc.'` with HQ `Cupertino, California` → `regions ['CA']`; empty or whitespace tokens dropped.
- [ ] **Step 2: Run** `npx vitest run tests/unit/companies-seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, run the generator, check the SQL row count (~5,800) and file size, dry-run and push the migration.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(finder): seed company watchlist from jobsync and S&P 500`.

---

### Task 6: Company resolver

**Files:**
- Create: `src/finder/resolve.ts`, `src/lib/companies/careers-url.ts` (pure, shared with the app)
- Test: `tests/unit/finder-resolve.test.ts`, `tests/unit/careers-url.test.ts`

**Interfaces:**
- Produces:
  - `parseCareersUrl(url: string): { ats: AtsKind; token: string; meta: Record<string, unknown> } | null`. `https:` only. Recognizes `boards.greenhouse.io/<t>`, `job-boards.greenhouse.io/<t>`, `jobs.lever.co/<t>`, `jobs.eu.lever.co/<t>` (meta region eu), `jobs.ashbyhq.com/<t>`, `careers.smartrecruiters.com/<t>`, `<t>.recruitee.com`, `apply.workable.com/<t>`, `<tenant>.wd<N>.myworkdayjobs.com/[<locale>/]<site>` (meta `{host, tenant, site}`). Anything else → null.
  - `slugCandidates(name: string): string[]` → up to 3 distinct: compact (`acmerobotics`), hyphenated (`acme-robotics`), first word (`acme`) — from `normalizeCompany`.
  - `resolveCompany(http: Http, c: { name: string; careersUrl: string | null }): Promise<{ ats: AtsKind; token: string; meta: Record<string, unknown> } | { notCovered: string }>`. With a parsable careers URL: verify by `fetchBoard`. Otherwise probe candidates across greenhouse, lever, ashby, smartrecruiters, recruitee, workable in that order; first board that returns ok with ≥ 1 job and whose company name (where the API returns one) normalizes equal or prefix-equal wins.
  - Not-covered copy (exact): `'No public job board found from the name. Add its careers page link.'` and `'That careers link uses a site Pipeline can't read yet.'`.

- [ ] **Step 1: Write the failing tests**: every URL form above; `javascript:alert(1)`, `http://boards.greenhouse.io/x`, `https://evil.test/boards.greenhouse.io/x` → null; `slugCandidates('Acme Robotics, Inc.')` → `['acmerobotics','acme-robotics','acme']`; resolver with fake fetch: Lever hit on second candidate wins; all 404 → `notCovered` first message; careers URL to a Greenhouse board returning 0 jobs still resolves (empty board is valid when the user gave the link).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(finder): resolve companies to ATS boards by name or careers link`.

---

### Task 7: Store and run orchestration

**Files:**
- Create: `src/finder/store.ts`, `src/finder/run.ts`, `scripts/finder.ts`
- Test: `tests/unit/finder-run.test.ts`, `tests/integration/finder-store.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `type Store = { startRun(trigger: string): Promise<string>; companiesToFetch(): Promise<BoardCompany[]>; companiesToResolve(limit: number): Promise<{ id: string; name: string; careersUrl: string | null }[]>; saveResolution(id: string, r: Awaited<ReturnType<typeof resolveCompany>>): Promise<void>; watchedCompanyIds(): Promise<Set<string>>; savePostings(runId: string, r: ScopeResult, keepExperienced: boolean): Promise<{ found: number; new: number }>; recordItem(runId: string, r: ScopeResult, counts: { found: number; new: number }): Promise<void>; finishRun(runId: string): Promise<Totals>; userIdsToMatch(): Promise<string[]>; refreshMatches(userId: string): Promise<void>; prune(): Promise<void> }`; `createSupabaseStore(client: SupabaseClient): Store`.
  - `runFinder(deps: { http: Http; store: Store; log: (line: string) => void }, opts: { trigger: 'manual' | 'schedule' | 'test'; only?: string[]; dryRun?: boolean; resolveLimit?: number }): Promise<RunSummary>` where `RunSummary = { runId: string | null; totals: Totals; scopes: { scope: string; status: string; found: number; new: number; reason?: string }[] }`.
  - CLI: `npx tsx scripts/finder.ts [--only simplify,greenhouse] [--dry-run] [--resolve-limit 150]`. Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` (loads `.env.local` if present). Prints a per-source table (scopes grouped by source: ok / failed / skipped counts, found, new) and the failed scopes with reasons. Exit code 0 unless the run itself crashed.
- Run order: start run → resolve up to `resolveLimit` companies → Simplify (2 scopes) → boards with concurrency 6 across hosts (spacing in `Http` keeps per-host politeness) → `finishRun` → `refreshMatches` for each user from `userIdsToMatch()` (all profiles; the SQL decides completeness) → `prune`. A crash after `startRun` marks the run `failed` before rethrowing.
- `savePostings`: drop `experienced`/`unknown` level unless `keepExperienced` (company watched); upsert `postings` on `dedupe_key` (insert sets `first_seen`, `status 'new'`; update refreshes `last_seen`, derived columns, and moves `gone` back to `seen`); upsert `posting_sources` on `(source, external_id)` with `scope`, `last_seen = now()`, `gone_at = null` (or `now()` when `active:false`). Batches of 500.

- [ ] **Step 1: Write the failing unit tests** with an in-memory fake `Store`:
  - `a failed scope is reported, not zero`: summary row `{status:'failed', reason:'HTTP 503 after 3 retries'}` and `finishRun` still called.
  - `matches refresh after finish` and `prune runs last` (call order).
  - `dry run writes nothing` (fake store's write methods never called; summary still has counts).
  - `crash marks the run failed`.
  - `log lines contain no user ids` (fake store returns ids `u-…`; assert no log line includes them).
  - `src/app never imports src/finder`: read every file under `src/app` and `src/lib` and assert no import path contains `finder/`.
- [ ] **Step 2: Write the failing integration test** `finder-store.test.ts` (test rows only): saving the same job from scope `test:simplify` (Greenhouse apply URL with a query string) and `test:greenhouse` produces one posting with two source rows; an experienced posting is dropped unless `keepExperienced`; a second save of a `gone` posting brings it back to `seen`.
- [ ] **Step 3: Run** both files. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS. Then locally `npx tsx scripts/finder.ts --only simplify --dry-run` prints two `simplify` scopes with non-zero found.
- [ ] **Step 6: Commit** `feat(finder): store, run orchestration and CLI`.

---

### Task 8: Matching (`refresh_matches`)

**Files:**
- Create: `supabase/migrations/20261109000300_refresh_matches.sql`
- Modify: `src/app/(app)/onboarding/actions.ts` (call after `saveStepOne` / `saveStepTwo` succeed, before `redirect`), `src/lib/onboarding/profile.ts` (export `refreshMyMatches(): Promise<void>`)
- Test: `tests/integration/refresh-matches.test.ts`

**Interfaces:**
- Produces: `public.refresh_matches(p_user uuid) returns text` (`'ok'` or `'incomplete'`), `security invoker`, `set search_path = ''`. Raises if `auth.uid() is not null and p_user <> auth.uid()`. Execute granted to `authenticated` and `service_role`.
- Rules (set-based `insert … on conflict (user_id, posting_id) do update`, never touching `state`; postings with `status = 'gone'` excluded):
  - Incomplete profile (definition in the design) → return `'incomplete'`, change nothing.
  - Level: stage `intern` → `level = 'internship'`; `new_grad` → `level = 'new_grad'`; `experienced` / `career_switcher` → `level in ('experienced','unknown')`.
  - Season: only for internships: pass when `terms = '{}'` or `season = any(terms)`; season `Full-time` passes all.
  - Place: `in_person` → (`work_anywhere_us` and `'US' = any(countries)`) or `states && work_states` or `countries && work_countries` (any `remote` value: `remote = 'remote'` means a remote option exists, and a posting with offices plus a remote option keeps its states); `either` → that, or `remote = 'remote'` and (`'US' = any(countries)` or `countries = '{}'`); `remote_only` → `remote = 'remote'` and (`'US' = any(countries)` or `countries = '{}'`). `location_unknown` → pass with reason `location_unknown`.
  - Field: `field_slugs && <user's category slugs>`, or the title contains a user's free-text label as a whole word (case-insensitive). Primary vs secondary recorded in `reasons.fields`. `// LLM-UPGRADE:` comment here.
  - Writes `passed_filter`, `filter_reasons` (failing rules: `level`, `season`, `place`, `field`), `reasons = {fields: [...], weight: 'primary'|'secondary', location_unknown: bool}`, `confirm_pay = pay_min_cents is null`, `base_score = null`.
  - Rows for postings that no longer pass get `passed_filter = false` (row kept, so `saved`/`hidden` survive).
- `refreshMyMatches()` calls `getCurrentUser()` and `rpc('refresh_matches', { p_user: id })` with the user client; an error is logged server-side and does not block the redirect (the nightly run repairs it).

- [ ] **Step 1: Write the failing integration tests** (one test user, reused; test postings with `test:` keys):
  - `null work_style is incomplete` → `'incomplete'`, no rows.
  - `in_person with no places is incomplete`; `remote_only with no places is complete`.
  - `remote_only gets only remote US postings` (CA onsite fails `place`; remote US passes; remote with countries `['GB']` fails).
  - `anywhere in the US passes any US state`; `in_person excludes fully remote postings (no states)`; `a posting in CA with a remote option passes both an in_person CA user and a remote_only user`.
  - `intern with Summer 2027 skips a Fall 2026 internship` but passes one with no terms.
  - `intern with Full-time season` still matches internships only (level rule).
  - `free-text field 'Actuarial' matches title 'Actuarial Intern'` and not `'Factual Reporting Intern'`.
  - `location_unknown passes with reason`.
  - `saved state survives a refresh that fails the posting` (`state='saved'`, `passed_filter=false`).
  - `cannot refresh another user` (user client with other id → error).
  - `gone postings are not matched`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/refresh-matches.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the migration**, dry-run, push, `npm run db:types`. Wire `refreshMyMatches` into both save actions.
- [ ] **Step 4: Run.** Expected: PASS. Existing onboarding integration and e2e tests still pass.
- [ ] **Step 5: Commit** `feat(matching): per-user filter as refresh_matches, run on profile save`.

---

### Task 9: Dashboard "New postings worth it"

**Files:**
- Modify: `src/lib/dashboard/queries.ts` (`getMatches`, new `getFinderStatus`), `src/app/(app)/dashboard/postings-panel.tsx`
- Create: `src/lib/dashboard/postings.ts` (pure)
- Test: `tests/unit/dashboard-postings.test.ts`, `tests/e2e/dashboard-postings.spec.ts`

**Interfaces:**
- Produces:
  - `MatchRow` gains `apply_url: string | null`, `locations: string[]`, `remote: RemoteKind`, `location_unknown: boolean`, `first_seen: string`, `is_new: boolean` (posting `status='new'`). `getMatches(limit = 20)` excludes postings with `status='gone'` and orders by `first_seen` desc (Phase 4 will reorder by score).
  - `getFinderStatus(): Promise<{ lastFinishedAt: string | null }>` (latest `finder_runs` with `status='finished'`).
  - `profileCompleteness(p: {career_stage, work_style, work_states, work_anywhere_us, work_countries, season}, fields: {weight}[]): { complete: true } | { complete: false; missing: ('stage'|'work_style'|'places'|'primary_field'|'season')[] }` (same rules as the SQL).
  - `locationLabel(m: Pick<MatchRow,'locations'|'remote'|'location_unknown'>): string` → `'Location not listed'`, `'Remote'`, first location plus `' +N'`.
  - `finderStale(lastFinishedAt: string | null, now: Date): boolean` (> 36 h, or null).
- Panel states (exact copy):
  - Incomplete: `'Finish your profile to see matching postings: <missing list>.'` linking to `/profile`.
  - Complete, finder never ran: `'Your first search runs when the daily finder goes live.'`
  - Complete, no matches: `'No matching postings yet. The finder checks every morning.'`
  - Stale: an extra note `'The finder last ran <date, UTC>.'`
  - List rows: title (links to `apply_url`, `target="_blank" rel="noopener noreferrer"`), company, `locationLabel`, `New` badge when `is_new`, `confirm pay` when flagged.

- [ ] **Step 1: Write the failing unit tests** for `profileCompleteness` (each missing item, `remote_only` with no places complete), `locationLabel`, `finderStale` (null → true, 35 h → false, 37 h → true).
- [ ] **Step 2: Write the failing e2e test**: a test user with a complete profile and two test postings (one passing) after `refresh_matches` sees one row with the Apply link; a user with null `work_style` sees the "Finish your profile" copy.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(dashboard): show matching postings with apply links and profile gaps`.

---

### Task 10: Companies on Profile

**Files:**
- Create: `supabase/migrations/20261109000400_watch_company.sql`, `src/app/(app)/profile/companies-section.tsx`, `src/app/(app)/profile/company-actions.ts`
- Modify: `src/app/(app)/profile/page.tsx`
- Test: `tests/integration/watch-company.test.ts`, `tests/e2e/profile-companies.spec.ts`

**Interfaces:**
- Consumes: `parseCareersUrl` (Task 6), `normalizeCompany` (Task 2).
- Produces:
  - `public.watch_company(p_name text, p_careers_url text, p_ats text, p_token text, p_meta jsonb) returns uuid` — `security definer`, `set search_path = ''`, execute to `authenticated` only. Requires `auth.uid()`. Name 1–120 chars after trim. Finds or inserts `companies` by `normalized_name` (the caller passes nothing it can use to overwrite an existing resolved row: ATS fields are written only when the row is new or has `ats = 'unknown'`; `careers_url` likewise; a written ATS sets `coverage = 'unknown'`, `resolved_at = null` so the finder verifies it). Inserts `user_companies (user_id, company_id, relation 'target')`. Raises `'limit'` when the user already has 100 rows.
  - Server actions `addCompany(formData)` / `removeCompany(companyId)`: call `getCurrentUser()`, validate with zod (name required; careers link optional, must pass `parseCareersUrl` when given, else message `'That link isn't a careers page Pipeline can read. Leave it blank and we'll search by name.'`), The RPC computes `normalized_name` with a new immutable SQL function `public.normalize_company(text)` (same migration) and never takes it from the client.
  - Section "Companies to watch" (`#companies`): add form (name, optional "Careers page link"), list of watched companies with status: `Covered (<ATS name>)`, `Checking in the next run`, or `Not covered: <reason>`, and a Remove button.

- [ ] **Step 1: Write the failing integration tests**: `normalize_company` agrees with TS `normalizeCompany` on a table of 12 names (suffixes, punctuation, case, `&`, extra spaces); adding a new name creates one company and one `user_companies` row; two users adding `'Acme, Inc.'` and `'ACME'` share one company; a user cannot change ATS/token of a `covered` company; the 101st add raises; anon cannot execute; `remove` deletes only the caller's row (company remains).
- [ ] **Step 2: Write the failing e2e test**: add `"Example Test Co"` with no link → listed as "Checking in the next run"; add with `javascript:x` link → the validation message; remove → gone from the list. Clean up the `test-…` company in `afterAll` with the admin client.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement** (the integration/e2e company names normalize to `test-…`; name them `Test- Example Co` etc.).
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(profile): watch companies by name with coverage status`.

---

### Task 11: Coverage page

**Files:**
- Create: `src/app/(app)/coverage/page.tsx`, `src/lib/coverage/queries.ts` (server-only), `src/lib/coverage/summary.ts` (pure)
- Modify: `src/app/(app)/nav-links.tsx` (add "Coverage")
- Test: `tests/unit/coverage-summary.test.ts`

**Interfaces:**
- Produces: `summarizeRun(items: { source: string; scope: string; status: 'ok'|'failed'|'skipped'; found: number; new: number; error: string | null }[]): { source: string; scopes: number; ok: number; failed: number; skipped: number; found: number; new: number }[]` (sorted by source), and `failedScopes(items)` (scope, reason) sorted by source then scope.
- Page: latest run's started/finished time and totals; one table row per source; a "Couldn't read" list of failed and skipped scopes with reasons; counts of companies by coverage (`covered`, `not_covered`, `unknown`). Readable by any signed-in user; no per-user data.

- [ ] **Step 1: Write the failing test** for `summarizeRun` (mixed statuses across two sources) and `failedScopes` ordering.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and page (`getCurrentUser()` at the top of the page's data loader).
- [ ] **Step 4: Run.** Expected: PASS. `npm run build` passes.
- [ ] **Step 5: Commit** `feat(coverage): per-source and per-company run report page`.

---

### Task 12: Workflow, docs and the first run

**Files:**
- Create: `.github/workflows/finder.yml`
- Modify: `DECISIONS.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§3.3 sources: mark intern-list.com and jobright dropped with the reason, add Workday low-volume rule)

**Interfaces:**
- `finder.yml`: `on: workflow_dispatch` only, with inputs `only` (string, optional) and `resolve_limit` (default `150`). One job on `ubuntu-latest`, `timeout-minutes: 120`, `concurrency: { group: finder, cancel-in-progress: false }`, `permissions: { contents: read }`, Node 24, `npm ci`, `npx tsx scripts/finder.ts --resolve-limit ${{ inputs.resolve_limit }}` with env `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from repo secrets (both already exist for the integration job). Pass `trigger` = `github.event_name`.

- [ ] **Step 1: Write the workflow.** Lint it by pushing the branch and confirming it appears under Actions (`gh workflow list`).
- [ ] **Step 2: Update docs.** `DECISIONS.md`: a "Phase 3: daily finder" section with the Phase 3 design (sources table and reasons, early-career rule, matching rules, incomplete-profile rule, builder calls), and mark the open items M7 (season stays one pick from `seasonOptions`; internships match by `terms`) and M8 (users are selected by the SQL completeness check; "search requested" is the profile save calling `refresh_matches`) resolved. `CLAUDE.md`: finder paths, CLI, workflow, test-row prefixes for global tables.
- [ ] **Step 3: Run all checks**: `npm run lint && npm run typecheck && npm test && npm run build && node scripts/check-bundle-secrets.mjs`. Expected: all pass. Push the branch; CI green.
- [ ] **Step 4: First run.** With the user's OK, `gh workflow run finder.yml --ref phase-3-finder`, wait for it, then read the run's printed table and the `/coverage` numbers.
- [ ] **Step 5: Show the user the per-source numbers** (found, new, failed scopes and top reasons, companies covered vs not, run time, and database size from the Supabase dashboard or `select pg_database_size(current_database())`). Fix anything the numbers show is broken (each fix its own commit with a test), re-run if needed.
- [ ] **Step 6: Commit** `ci(finder): manual finder workflow; docs for Phase 3`.

---

### Task 13: Switch on the daily schedule (only after the user says yes)

**Files:**
- Modify: `.github/workflows/finder.yml`, `DECISIONS.md`

- [ ] **Step 1:** Ask the user to approve the schedule after they have seen Task 12's numbers. Stop here until they say yes.
- [ ] **Step 2:** Add `schedule: - cron: '17 10 * * *'` (10:17 UTC, about 5–6 am US Eastern; off the top of the hour, when GitHub delays cron jobs). Scheduled workflows run from the default branch, so this takes effect once the PR is merged to `main`. Record it in `DECISIONS.md`, including the 60-day inactivity pause and the dashboard stale note that surfaces it.
- [ ] **Step 3: Commit** `ci(finder): run the finder daily`. Tell the user the PR is ready for them to open and merge, and that prod needs `vercel --prod` (with their OK) for the dashboard, Profile and Coverage changes.
