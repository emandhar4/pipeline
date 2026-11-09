# Decisions

Each entry: decision, why, who decided. Source: design spec section 2.

## 2026-11-07

### Name
- **Decision:** "Pipeline" (placeholder name).
- **Why:** Needed a working name; easy to change later.
- **Who decided:** user

### Fork vs. fresh build
- **Decision:** Fresh build. Borrow ideas and MIT-licensed data from Gsync/jobsync, with attribution here and in `THIRD_PARTY_NOTICES.md`.
- **Why:** The product must serve many users and fields; a fresh design avoids inheriting single-user assumptions while still reusing useful open data.
- **Who decided:** user approved Claude's recommendation

### Web app
- **Decision:** Next.js (App Router, TypeScript) on the Vercel free tier.
- **Why:** Hosted, free, fits the cloud-only constraint.
- **Who decided:** user approved

### Database / auth / files
- **Decision:** Supabase (Postgres 17, Supabase Auth, Supabase Storage). Project `pipeline-agent`, ref `lxrtmkipbtdwjercczmt`; Vercel project `pipeline-agent`; both already linked.
- **Why:** The data is relational (postings, applications, contacts, companies). The free tier has hard limits, whereas Firebase Cloud Functions require pay-as-you-go with no hard cap. Supabase's 7-day inactivity pause is a non-issue because the finder writes daily. Main constraint: 500 MB database, so postings store a description snippet and "gone" postings older than a retention window are pruned.
- **Who decided:** user approved

### Daily finder
- **Decision:** GitHub Actions cron, TypeScript (Node 24). JobSpy (Python) is an optional later step, only for boards whose terms allow it.
- **Why:** Runs unattended in the cloud for free on a public repo.
- **Who decided:** user approved

### Google Drive
- **Decision:** Optional connection for files only (resume uploads, generated PDFs, exports). Never the database.
- **Why:** Keeps the database authoritative and Drive access minimal.
- **Who decided:** user

### AI, stage 1
- **Decision:** AI steps run as Claude cloud routines on the user's Claude plan ($0 extra). The site writes a work queue; routines read it and write results back. Local desktop scheduled tasks do not qualify.
- **Why:** No extra cost, and the laptop must be able to be off.
- **Who decided:** user (cloud constraint), Claude (routines)

### AI, stage 2
- **Decision:** Anthropic API key with a monthly spend cap, server-side only. Haiku for scoring/drafting, Sonnet for resume tailoring. Switching is a config change.
- **Why:** Scales AI features to other users without a surprise bill.
- **Who decided:** user

### Workflow
- **Decision:** Work in 7 phases; demo each working before the next. Keep `DECISIONS.md` and `CLAUDE.md` in the repo.
- **Why:** Keeps scope controlled and gives the user a checkpoint per phase.
- **Who decided:** user

### Audience (v1)
- **Decision:** The first user plus a few invited users. Invite-only signup (no open registration). Size everything for roughly 25 users or fewer.
- **Why:** Limits cost, support burden and abuse surface.
- **Who decided:** user

### AI per audience
- **Decision:** Stage 1 routines process the first user's queue only. Other users get the deterministic score and no AI features until stage 2 is switched on. The AI layer must be able to enable stage 2 per user or globally.
- **Why:** Routines run on one person's Claude plan.
- **Who decided:** user

### Coverage
- **Decision:** Internships and new grad at launch. Phase 3 adds and vets new-grad sources (e.g. SimplifyJobs/New-Grad-Positions and current jobright-ai new-grad repos), each with a terms check. Experienced and career-switcher users rely on the ATS watchlist in v1 (known gap).
- **Why:** Matches the first users while keeping source vetting manageable.
- **Who decided:** user

### GitHub repo
- **Decision:** Public (unlimited free Actions minutes). No personal data in the repo, ever: no real seed data, resumes, offers or tracker exports.
- **Why:** Free CI minutes; the consequence is strict data hygiene.
- **Who decided:** user

### Test-user seed
- **Decision:** Real data lives in the hosted database: the first user's real profile and held offer, and their existing tracker imported in Phase 5. Loaded through the app's own onboarding/import flows or a gitignored local seed file, never a committed one. The committed seed is fictional demo data.
- **Why:** Realistic testing without leaking personal data into a public repo.
- **Who decided:** user

### Alerts (v1)
- **Decision:** In-app only (dashboard and Today). Email digest is a later option (needs a free-tier sending provider).
- **Why:** Avoids a sending-provider dependency in v1.
- **Who decided:** Claude's call

### Google OAuth
- **Decision:** Stays in "testing" mode (up to 100 named test users; fits invite-only). Drive uses the narrow file-only scope (`drive.file`) and lands in Phase 6 with the resume engine. Gmail/Calendar in Phase 7 use read-only scopes. Public verification is out of scope for v1.
- **Why:** Verification is slow and unnecessary for an invite-only audience.
- **Who decided:** Claude's call

### Invite-only signup hook
- **Decision:** `before_user_created` hook is `public.hook_require_invite` (invites table, case-insensitive match via lowercase-enforced emails). The migration and `supabase/config.toml` are committed. The hook was enabled on the hosted project on 2026-11-08 (via `supabase config push`, after `config.toml` was aligned with the hosted settings so the diff held only the hook; always run `npx supabase config diff --agent no` first and push only when the diff is exactly what you intend). The Auth Admin API bypasses the hook, so the invite-reject test uses the public `signUp`. The git history was scrubbed of personal data before the first push.
- **Why:** config push overwrites everything config.toml declares, so config.toml must mirror the hosted project except for intended changes.
- **Pending (owner, manual):** Google OAuth provider setup, deferred by the owner. Until it is done, only the owner can sign in (magic link); invitees cannot.
- **Pending:** `vercel git connect` needs a GitHub Login Connection on Vercel. Until then deploys are manual (`vercel --prod`).
- **Who decided:** Claude's call, per controller ruling

### Auth sessions under Cache Components
- **Decision:** Keep `cacheComponents` and `partialPrefetching` on. Session reads sit behind `<Suspense>`; `getCurrentUser()` (`src/lib/auth.ts`) calls `connection()` before `getClaims()` because JWT verification compares expiry to the clock, which Cache Components flags during runtime prefetch. The proxy (`src/proxy.ts`) refreshes the session with `getClaims()` and is default-deny: everything except `/login` and `/auth/*` redirects signed-out users to `/login?next=<path>`. The `(app)` layout re-verifies with `getClaims()` (never `getSession()`).
- **Why:** Follows the Next 16 "Authentication with Cache Components" guide and the Supabase SSR example without disabling caching; default-deny means new routes are protected automatically.
- **Who decided:** Claude (Task 5)

### Redirect targets and sign-out
- **Decision:** Every `next` parameter goes through `safeNext()` (single leading `/`, no backslashes or control characters, same-origin after URL parsing). Sign-out is `POST /auth/signout` only. Login errors are fixed codes mapped to fixed copy; query text is never reflected.
- **Why:** Prevents open redirects, cross-site sign-out via links/prefetch, and reflected content.
- **Who decided:** Claude (Task 5)

### CI design
- **Decision:** `.github/workflows/ci.yml` runs on every push and on pull requests to `main`: lint, typecheck, unit tests (`tests/unit`), build, bundle secret check. Build-time `NEXT_PUBLIC_*` vars are placeholders in the workflow (env validation needs well-formed values, not real ones). Integration tests are a separate job that runs only on `push` to `main` with repo secrets, since they hit the hosted project and PRs must not depend on secrets.
- **Why:** Fast feedback on every branch without exposing secrets to PR runs or touching the hosted database from feature branches.
- **Who decided:** Claude's call, per controller ruling

### Client bundle secret check
- **Decision:** `scripts/check-bundle-secrets.mjs` fails CI if any file in `.next/static` contains the name `SUPABASE_SECRET_KEY` or (when set) its value. In CI it can only match the name (the secret is not set in the build job); the value check runs locally, where the secret is set. Verified by temporarily referencing the secret in a client component (exit 1), then reverting.
- **Why:** A cheap last-line guard against the service key reaching the browser, beyond `server-only` imports.
- **Who decided:** Claude (Task 7)

### Production URL and preview limitation
- **Decision:** Production alias is `https://pipeline-agent-peach.vercel.app`. `NEXT_PUBLIC_SITE_URL` is set to it for both production and preview (the env schema requires a valid URL), so sign-ins started from a preview deployment redirect back to production. Supabase Auth `site_url` and redirect allow-list contain localhost and the production URL only. `vercel.json` pins the framework to Next.js and `engines.node` to 24.x. Deploys are currently done with `vercel --prod` because `vercel git connect` needs a GitHub login connection on the Vercel account (manual step).
- **Why:** Free tier, single auth redirect target; preview auth is not a goal in Phase 1.
- **Who decided:** Claude (Task 7)

## Phase 2 decisions (2026-11-08)

### Real data only
Phase 2 uses real data only: no fictional seed rows in shared tables. The dashboard shows the user's own rows and empty states. This replaces the spec's "dashboard shell with fictional seed data" and resolves the Phase 1 open item about keeping demo rows out of real users' data.

### Field category vocabulary
`field_categories` is a global table (read-only for `authenticated`) seeded with the 21 categories listed on intern-list.com, retrieved 2026-11-08. `profile_fields.category_slug` references it; free-text `label` stays user-owned, unique per user case-insensitively. `profile_industries` is likewise unique per user case-insensitively, and `profiles` gains checks on `work_auth`, `pay_floor_cents` and `onboarding_step`.

## Open items carried from the Phase 1 final review (2026-11-08)

- **Before invitees:** set up the Google OAuth provider (manual; owner deferred). Then verify with one invitee.
- **Phase 2 must decide:** how fictional seed or demo rows stay out of real users' global data (`is_demo` marker, or a demo-only account with per-user rows).
- **Phase 2 migrations:** `profile_fields` and `profile_industries` need `not null` and unique `(user_id, …)` constraints, plus a decision on the field-category vocabulary.
- **Phase 2 code:** every page that reads data and every server action calls `getCurrentUser()`; never rely on the layout. Return 401 JSON for `/api/*` instead of a redirect.
- **Phase 6:** `resume_rules` gets a `default auth.uid()` and one active rule set per user.
- **Hardening backlog:**
  - Neutral login message vs. invite-list oracle; set `invites.accepted_at` on first confirmed sign-in.
  - Disable unused password signup.
  - Revoke `anon` privileges on per-user tables.
  - Cross-tenant FK existence oracle on user-owned FKs.
  - `ai_jobs` input editable after claim; users can write their own `posting_matches` scores.
  - Missing checks/FKs: `pay_min <= pay_max`, `resumes.posting_id`, `school_companies` unique.
  - Sign-out Origin check.
  - `safeNext` length cap; truncate the logged `error_description`.
  - `db:types` truncates the file on CLI failure.
  - Repo sits in an iCloud-synced folder, which caused duplicate `.next` files.

## Onboarding step 2 save is not transactional (2026-11-08)

`saveStep2` replaces `profile_fields` and `profile_industries` by deleting the user's rows and inserting the new set, then updates the `profiles` pay/season columns. These are separate requests, not one transaction. If a later request fails, the user may be left with a cleared or partial set until they resubmit; the error is thrown, not swallowed, so the form shows it. Acceptable for a single user editing their own profile. Revisit with an RPC if that changes.

## Onboarding forms (2026-11-08)

- The step forms submit through `onSubmit` + `startTransition(formAction)` instead of the `<form action>` prop. React resets uncontrolled fields after a form action, which would wipe the user's answers on a validation error. The cost is that the forms need JavaScript (step 2's chips need it anyway).
- The in-state question shows only when both locations are filled, and then it must be answered. Otherwise `in_state_school` is stored as null (unknown), never a guessed `false`. The schema drops a stale answer when a location is cleared.
- `/profile` is for finished onboarding. A user below step 2 is redirected to `/onboarding`.
- Step-2 "add your own" chips use `category_slug = null`. Typing a name that already has a chip turns that chip on instead.
- e2e specs share `tests/e2e/helpers.ts`. Auth specs mark their users onboarded with the admin client so the dashboard gate does not redirect them.

## Dashboard (2026-11-08)

- The daily finder must set `posting_matches.passed_filter = true` for rows that pass the profile filter; the dashboard's "New postings worth it" panel shows only those.
- Task due dates display in UTC until the user's time zone is stored.
- Each dashboard panel has its own error boundary (retry in place), so one failed query does not blank the page.

## Phase 3: daily finder (2026-11-08)

Resolved from the earlier open items: ~~I3 structured regions~~ (Phase 2b). ~~M7~~ Season stays one pick from `seasonOptions`; internships match by `terms`. ~~M8~~ Users are selected by the SQL completeness check; "search requested" is the profile save calling `refresh_matches`.

### Sources (vetted 2026-11-08)

| Source | Status | Why / how |
|---|---|---|
| SimplifyJobs Summer2027-Internships and New-Grad-Positions | Use | One GET of `listings.json` (branch `dev`) each; keep `active && is_visible`. No LICENSE: we store normalized rows and link to the employer, never republish the file. Tech categories only. |
| Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable | Use | Documented public board JSON, one company board per scope. |
| Workday | Use, low volume | Only companies with a known careers link (a user pasted it). Undocumented `cxs` POST, `intern` then `graduate`, at most 3 pages of 20 per search, 1 request per 2 s per host, skipped if the tenant's robots.txt disallows `/wday/`. |
| intern-list.com, jobright-ai repos | Dropped | Run by Jobright; its terms (updated 2026-07-29) forbid scraping, harvesting or redistributing job or employer data, and apply links route through jobright.ai. Reverses the original spec source list. |
| LinkedIn, Handshake | Never | Terms / login wall. Phase 5 import covers what the user applied to there. |

Watchlist seed: MIT-licensed `Gsync/jobsync` company directories (~5,400 boards) plus the public-domain S&P 500 constituents list (HQ state as `regions`), at pinned SHAs. Users add more companies by name on Profile, with an optional careers link as a fallback.

### Product rules

- **Goal is coverage:** never miss a role worth applying to. The fit score and the bar are Phase 4.
- **Early-career rule:** keep roles with level `internship` or `new_grad` from every company. Experienced or unknown-level roles are kept only from companies some user watches. This bounds database size under the 500 MB free tier.
- **Matching (`refresh_matches`):** level vs career stage, season (internships by `terms`), places vs work style, fields. Avoided industries, capped or rejected companies, pay floor and work authorization are Phase 4. `confirm_pay` is set when the posting has no pay.
  - `remote='remote'` means "a remote option exists" (any location part remote, no "hybrid" in the text). A posting with offices and a remote option keeps its states and `remote='remote'`.
  - `in_person`: place overlap, and fully remote postings (`remote='remote'` and no states) do not count. Consequence: "London, UK or Remote" is treated as fully remote for in-person users.
  - `either`: place overlap, or remote with US/no countries. `remote_only`: remote with US/no countries.
  - A posting with no parsable location passes the place filter with reason `location_unknown` ("Location not listed").
- **Incomplete profile** (null `career_stage`, null `work_style`, no places unless `remote_only`, no primary field, or null `season`) gets no new matches; the dashboard asks the user to finish the profile. "No places" is never read as "anywhere".
- **Failure handling:** a failed scope is recorded as failed with a reason, never as 0 found, and never marks its postings gone.
- **Partial scopes:** a capped fetch (SmartRecruiters 10 pages, Workday 3 pages per search) reports `complete: false`; the store records the run item as `skipped` with "partial: stopped at N rows", so its unseen postings are never marked gone. Cost: postings that vanish from a capped scope linger until another source or a manual cleanup.
- **Simplify inactive rows** are never inserted if unseen before (~12k history rows); an existing source row is only set gone. Inactive rows are matched by scope, not just source: one Simplify id can be live in `simplify:intern` and inactive in `simplify:newgrad`, and the other list's flag must not end it (run 1 wrongly marked 31 postings gone this way; the next run revived them).
- **A board that returns HTTP 404** resets its company to `ats='unknown'`, `coverage='unknown'`, `resolved_at` null (guarded by the fetched ats and token), so the resolver re-probes it, and retires that scope's live source rows: postings left with no live source go `gone`. Without this, ~142 stale seed tokens failed daily, showed "Covered" on Profile, and their postings stayed live with dead links forever. Cost: a 404 from an ATS-side glitch drops a good token until the resolver finds it again; a re-resolve to the same token revives the rows.
- **A posting's facts add up across sources:** when a posting is seen again, `field_slugs` and `terms` are unioned with the stored values, and `level` keeps the stored value unless it is `unknown`. Board sightings (saved after Simplify) would otherwise erase Simplify's category-derived fields and internship/new-grad level. Cost: a wrong field or level from one source sticks while the posting lives.

### Builder calls

- **Dedupe key:** `canonicalJobKey(applyUrl)` for recognizable ATS job URLs (`greenhouse:<token>:<id>`, `lever:...`, `ashby:...`, `workday:<host>:<path>`), else `h:` + sha1 of normalized company, title, location key and sorted countries. This joins the same job found in Simplify and on the company's own board.
- **Status:** `new` in the run that first inserts a posting, `seen` from the next run, `gone` when every `posting_sources` row is gone. A source row goes gone when its scope succeeded and did not return it (or Simplify says inactive). Timestamps use max(client now, `run.started_at`) so clock lag cannot mark live rows gone.
- **Retention:** `gone` postings with `last_seen` older than 60 days are deleted unless a match is `saved` or `applied`. `finder_run_items` older than 30 days are deleted; `finder_runs` are kept.
- **Polite fetch:** user agent `PipelineFinder/1.0 (+https://github.com/emandhar4/pipeline)`; per-host spacing 500 ms (Lever 1000 ms, Workday 2000 ms) with the slot held through the fetch; boards are interleaved round-robin by host, not drained one ATS at a time; retries on 429/5xx/network errors at 2 s, 8 s, 30 s (honoring `Retry-After` up to 60 s); 30 s timeout; then the scope is `failed` with the reason.
- **Resolver:** at most 150 `unknown` companies probed per run, about 18 fetches per company. Name-probing slug candidates are the compact and hyphenated forms only (no bare first word, to avoid recording another employer's board). It does not try the EU Lever host. If any probe hit a transient error and nothing matched, the result is "Could not check its job board this run." and the company stays `unknown`, so an outage never records "no board". That result still touches the company's `updated_at`, and the queue picks watched companies first, then oldest `updated_at`, so persistently unreachable companies rotate to the back instead of filling every run's 150. Cost: a company whose token is only its first word needs a careers link.
- **Workflow:** `finder.yml` runs daily at 10:17 UTC (`cron: '17 10 * * *'`, about 5–6 am US Eastern, off the top of the hour when GitHub delays cron jobs) and on `workflow_dispatch`, with `only` and `resolve_limit` inputs passed through env vars (scheduled runs use the defaults: everything, 150). Turned on after the user reviewed the first run's numbers. Scheduled workflows run from the default branch, so the schedule starts once `finder.yml` is merged to `main`. GitHub pauses scheduled workflows in a public repo after 60 days with no repository activity; the dashboard's "The finder last ran ..." note (shown when the last finished run is over 36 hours old) is how that surfaces, and re-enabling the workflow in the Actions tab fixes it. `workflow_dispatch` can only be triggered once `finder.yml` is on the default branch. The log holds counts, sources and company names only, never user data (the repo is public).
- **Test rows in global tables:** `dedupe_key` `test:`, `posting_sources.source` `test`, `finder_runs.trigger` `test`, and test companies named `Test- ...` (normalize_company turns `-` into a space, so no normalized name can start `test-`).

### Open items

- Remote matching is US-only: an `either`/`remote_only` user with non-US `work_countries` misses e.g. "Remote - UK"; fixing it needs a migration.
- A permanently bot-blocked (403) slug host keeps a company `unknown` forever (retried each time it reaches the front of the queue), so it never shows "add a careers link". Giving up after N tries needs a counter column (a migration).

## Phase 2b: onboarding UX (decided and built 2026-11-08)

User feedback after trying Phase 2 onboarding. The agreed fixes, as built:

1. **School and major type-ahead.** Comboboxes that narrow as you type. Schools come from the public US Dept. of Education College Scorecard list, seeded into the existing global `schools` table. Majors come from a trimmed CIP program list. Both have a "not listed, use what I typed" fallback.
2. **Concrete relocation.** Replace `no` / `within_region` / `anywhere` with two questions. "Where can you work?" is a multi-select of US states, with shortcuts for home state, school state and named areas (e.g. Southeast), plus "Anywhere in the US". "How do you want to work?" is one required choice of three, asked above "Where can you work?": In person only (jobs only in the picked places), In person or remote (the picked places plus remote jobs anywhere in the US), or Remote only (remote jobs anywhere in the US). Stored as `profiles.work_style` (`in_person` / `either` / `remote_only`), which replaced the unreleased `open_to_remote` boolean in migration 0850. In person and either need at least one place (a state, Anywhere in the US, or a country); Remote only hides the place picker and saves no places. "Anywhere" means US only, and non-US work requires adding a country explicitly. This resolves open item I3 (structured regions).
3. **Resume-first onboarding.** The optional first step is uploading a resume (PDF). It goes to a private Supabase Storage bucket with RLS keyed to `auth.uid()`. Text is extracted server-side to prefill school, major, grad date and location. Primary and secondary fields are suggested from the resume, and the user reviews everything before saving.
   - **Ruling (user):** use deterministic **keyword matching** for now (text extraction plus a keyword-to-category map), with no API cost. Add an Anthropic API key (Claude Haiku, server-only, with a monthly cap) **at the very end of the build** to upgrade resume reading.

### Phase 2b implementation decisions

- **Named areas** are the BEA regions (New England, Mid-Atlantic, Great Lakes, Plains, Southeast, and so on), with "Mid-Atlantic" and "West Coast, Alaska and Hawaii" as the labels (`AREAS` in `src/lib/onboarding/regions.ts`).
- **50 states plus DC only.** Territories (PR, GU and so on) are a known gap: they are not selectable states, and `work_countries` rejects US and territory codes.
- **`in_state_school` is derived** from home state and school state, and the question was removed from onboarding. The school-state toggle is hidden when it equals the home state. "Outside the US" and "Choose..." both store a null home/school state (not remembered after reload).
- **Expand/contract for `relocate`.** Migration 0800 added the structured columns and backfilled from `relocate`; 0850 replaced the unreleased `open_to_remote` with the three-way `work_style` (In person only / In person or remote / Remote only); 0900 dropped `relocate` and its enum once nothing read it.
- **The Scorecard key is a local, one-time seed input only.** `SCORECARD_API_KEY` lives in gitignored `.env.local`, is read only by `scripts/build-schools-seed.ts`, and appears in no CI, Vercel or browser config.
- **Majors search.** `search_majors` orders by `word_similarity` then `length(title)`. The majors seed drops only Action "Deleted" and "Moved to" rows; "Moved from" rows are live 2020 codes.
- **Keyword reader rules** (`suggestFields` in `src/lib/resume/parse.ts`, using `FIELD_KEYWORDS`): categories are scored by distinct keyword hits. Primary is the top category if it has 3 or more hits. Secondary is up to 2 more categories with 2 or more hits and at least half the primary score. Ties follow the category order.
- **Parsing details** (`parse.ts`): the education-line regex uses `\bb\.?s\b` / `\bb\.?a\b` so "jobs" and "database" do not count. Season mapping: Spring to 05, Summer to 08, Fall to 12, Winter to 12, "Class of YYYY" to YYYY-05. `processResume` takes an optional `categoryOrder` argument (the action passes the order it already loaded).
- **Suggestions storage.** Suggestions live on `resumes.suggestions` and reach the profile only through form submit; nothing is written to `profiles` by the reader. Unmatched school phrases are not pre-filled.
- **Resume step behavior.** The banner counts visible answers only. Step-1 prefill happens only before step 1's first save; step-2 prefill only when no fields are saved, with stale slugs dropped. "Skip for now" saves nothing, so a bare `/onboarding` shows the resume step again until step 1 is saved.
- **No-LLM check.** `grep -ri anthropic src package.json` hits only the required LLM-UPGRADE comment in `src/lib/resume/reader.ts` ("AnthropicProvider"). There is no Anthropic code, dependency or env var.
- **LLM-UPGRADE points** (for the API reader at the end of the build):
  - `src/lib/resume/reader.ts`: swap `resumeReader` for an API-backed reader with the same input and output types.
  - `src/lib/resume/keyword-reader.ts`: the `suggestFields` call (role and field inference is the main gain).
  - Extracted text is not stored; if the API reader needs it, re-extract from Storage for now (or store it then).
- **Pre-0850 profiles.** Profiles that existed before 0850 have `work_style` null (`open_to_remote` was never backfilled from `relocate`). `/profile` requires a choice before saving. The Phase 3 finder must treat null `work_style` or empty places as incomplete, not as "no places".
- **User-writable resume rows.** Users can write their own `resumes.suggestions` and `storage_path` (owner full-access RLS). Reads re-validate with `resumeSuggestionsSchema`, and any future service-role job that reads `resumes.storage_path` must re-check `isOwnResumePath(user_id, path)`.
- **Unreadable uploads** are removed from Storage by `processResume` (best effort; a failed removal is logged and does not change the user-facing message).
- **Known follow-ups.** Deleting a real account must also remove its Storage folder (`<uid>/`).
- **Resume any time (2026-11-08, user request).** A resume can be uploaded at any point: the onboarding step marker links "Resume (optional)" always, "Who you are" when not current, and "What you want" once step 1 is saved; `/profile` has a Resume section (`#resume`) with the same upload control (no "Skip for now"; error messages drop "or skip this step"). After a profile upload the page reloads at `/profile?resume=1#who-heading`.
- **Suggestions after step 1 is saved are hints, never edits.** The prefill gate is unchanged (fills only empty step-1 answers before step 1's first save; step 2 only when no fields are saved). Otherwise, onboarding and Profile show "Resume says: …" with "Use this" under school, major, graduation month and home city (home city also sets home state) where the suggestion differs from the saved answer, saved blanks included; school and major compare ids when both have one, else names, case and spaces ignored. Step 2 shows one "Resume suggests: …" hint when the resume's fields differ from the saved category fields; "Use these" sets the category chips to the suggestion (others off) and leaves fields the user added by hand. Applying a hint changes the form only and marks the field "from resume"; nothing is saved until the user saves. Logic: `stepOneHints`/`stepTwoHint` in `src/app/(app)/onboarding/prefill.ts`.
- **Dashboard resume nudge is derived, not a task.** With no valid uploaded resume, Today shows "Add your resume so Pipeline can suggest answers and fields." below the real tasks, linking to `/profile#resume` (`/onboarding?step=resume` if setup were unfinished). Decision in `resumeNudge` (`src/lib/dashboard/today.ts`). "Last read" dates on Profile are shown in UTC.
