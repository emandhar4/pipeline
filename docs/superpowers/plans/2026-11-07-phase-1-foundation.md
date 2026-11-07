# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js site on Vercel with invite-only Supabase sign-in, the full Phase 1 data model behind Row Level Security, project docs, and CI on a public GitHub repo.

**Architecture:** Next.js 16 App Router (TypeScript, `src/`), talking to the hosted Supabase project through `@supabase/ssr` cookie sessions refreshed in `src/proxy.ts`. Schema lives in `supabase/migrations/*.sql`, pushed to the hosted project (no Docker on this machine, so there's no local Supabase stack). Invite-only signup is enforced in the database by a `before_user_created` auth hook that checks an `invites` table.

**Tech Stack:** Node 24, Next.js 16.4, React 19, Tailwind CSS 4, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.119, zod 4, Vitest 5, Playwright 1.65, Supabase CLI 3, Vercel CLI, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-07-pipeline-design.md`

## Global Constraints

- Nothing may depend on the user's laptop being on. Every runtime piece is Vercel, Supabase or GitHub Actions.
- The GitHub repo is **public**: no personal data is ever committed (no real profile, offer, resume or tracker data). Real data enters through the app, or through a gitignored `supabase/seed.local.sql`.
- No secret in the browser or the repo. `SUPABASE_SECRET_KEY` is used only in server-only modules (`import 'server-only'`) and in CI/Vercel secrets.
- Every per-user table has RLS enabled, with policies keyed to `auth.uid()`. Global tables are readable by `authenticated` and writable only by the service role.
- Signup is invite-only: an email can create an account only if it's in `invites` (compared case-insensitively).
- Supabase's built-in email only delivers to project team members. Magic-link email therefore works for the project owner only. Invitees sign in with Google OAuth (or custom SMTP later).
- Free tiers only, no paid services.
- No Docker. Database commands target the linked hosted project (`supabase ... --remote` / `--linked`; check the flag with `--help` for CLI 3.0).
- Integration tests run against the hosted project, which also holds real data. They touch only their own `@example.test` users and delete them in `afterAll`. They never read, modify or truncate other rows.
- Supabase project ref: `lxrtmkipbtdwjercczmt`. Vercel project: `pipeline-agent`.
- Use Context7 for current library docs before writing code against a library.

## Review Focus

1. **Invite email case.** `Owner@Example.test` must match the invite `owner@example.test`. Test in Task 4.
2. **Open redirect.** `/login?next=https://evil.com` must never redirect off-site, and only relative paths starting with a single `/` are allowed. Test in Task 5.
3. **Users who existed before the profile trigger.** The owner's auth user may already exist, so the migration backfills `profiles` for existing `auth.users`. Test in Task 2.
4. **Secret leaking to the client bundle.** After `next build`, no file under `.next/static` contains the value of `SUPABASE_SECRET_KEY`. Test in Task 7.
5. **Deleting a user leaves no orphaned rows.** Every per-user FK to `auth.users` uses `on delete cascade`. Test in Task 6.

---

### Task 1: Scaffold the app, docs and test tooling

**Files:**
- Create: Next.js app at repo root (`package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`)
- Create: `vitest.config.ts`, `tests/unit/smoke.test.ts`
- Create: `CLAUDE.md`, `DECISIONS.md`, `THIRD_PARTY_NOTICES.md`, `.env.example`
- Modify: `.gitignore` (add `supabase/seed.local.*`, `/playwright-report`, `/test-results`, `.next/`)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`).

- [ ] **Step 1:** Run `npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack` in the repo root, keeping the existing `.gitignore`, `docs/` and `supabase/`. If it refuses a non-empty directory, scaffold into a temp dir inside the scratchpad and move the files in.
- [ ] **Step 2:** Add dev deps `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `server-only`, and deps `zod`, `@supabase/ssr`, `@supabase/supabase-js`. Add the scripts listed above.
- [ ] **Step 3: Write `tests/unit/smoke.test.ts`**: `expect(1 + 1).toBe(2)`, just to prove the runner works. Configure Vitest with the `@` alias and `include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts']`.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. All must exit 0.
- [ ] **Step 5: Write the docs.**
  - `CLAUDE.md`: what Pipeline is (one paragraph from spec §1), the commands, the constraints above (especially public repo / no personal data / no Docker / RLS on every user table), where the spec and plans live, and "use Context7 before library code".
  - `DECISIONS.md`: one dated entry per decision in spec §2, each with *decision · why · who decided*.
  - `THIRD_PARTY_NOTICES.md`: a heading for Gsync/jobsync (MIT), filled in when data is borrowed in Phase 3.
  - `.env.example`: variable names only, no values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `FIRECRAWL_API_KEY`, `NEXT_PUBLIC_SITE_URL`.
- [ ] **Step 6:** Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`, copying the values of the existing `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Never print the values.
- [ ] **Step 7: Commit.** Check first that `git status` shows no `.env*` file.

```bash
git add -A && git commit -m "chore: scaffold Next.js app, docs and test tooling"
```

### Task 2: Per-user schema with RLS

**Files:**
- Create: `supabase/migrations/20261107000100_user_tables.sql`
- Test: `tests/integration/rls-user-tables.test.ts`, `tests/integration/helpers.ts`

**Interfaces:**
- Produces (tables, all with `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade default auth.uid()`, `created_at`/`updated_at timestamptz default now()` unless noted):
  - `profiles` (pk `user_id`): `career_stage` enum `intern|new_grad|experienced|career_switcher`, `school`, `major`, `grad_date date`, `work_auth` text, `home_location`, `school_location`, `in_state_school bool`, `relocate` enum `no|within_region|anywhere`, `pay_floor_cents int`, `pay_floor_period` enum `hour|year`, `season` text, `alert_style` text default `'in_app'`, `onboarding_step int default 0`, `ai_mode` enum `off|queue|api` default `'off'`.
  - `profile_fields`: `category` text, `label` text, `weight` enum `primary|secondary`.
  - `profile_industries`: `industry`, `preference` enum `prefer|avoid`.
  - `bars`: `company`, `role`, `pay_cents int`, `pay_period`, `rules jsonb default '{}'`.
  - `user_companies`: `company_id uuid references companies` (FK added in Task 3), `relation` enum `dream|target|capped|rejected`, unique (`user_id`, `company_id`, `relation`).
  - `contacts`: `company_id uuid null`, `name`, `email`, `linkedin_url`, `role`, `is_referral bool default false`, `notes`.
  - `applications`: `posting_id uuid null`, `company_name`, `title`, `stage` enum `saved|applied|screened|interviewed|final|offer|closed`, `outcome` enum `rejected|withdrawn|no_response|declined|accepted` null, `channel` enum `cold|referral` default `'cold'`, `referral_contact_id uuid null references contacts`, `applied_at date`, `last_activity_at timestamptz default now()`, `source` text.
  - `application_events`: `application_id references applications on delete cascade`, `kind` text, `from_stage`, `to_stage`, `occurred_at`, `note`.
  - `tasks`: `kind` enum `assessment|interview|follow_up|outreach|closing_soon|onboarding|other`, `title`, `due_at`, `status` enum `open|done|snoozed`, `snoozed_until`, `ref_table` text, `ref_id uuid`.
  - `experience_items`: `kind` enum `role|project|education|skill|tool|metric|never_claim`, `title`, `org`, `start_date`, `end_date`, `bullets jsonb default '[]'`, `tags text[]`.
  - `resume_rules`: `user_id` **nullable** (null = global default), `rules jsonb not null`, `version int`.
  - `resumes`: `kind` enum `uploaded|generated`, `storage_path`, `posting_id uuid null`, `extraction_ok bool null`, `extraction_report jsonb`.
  - Trigger `handle_new_user()` (security definer) inserting a `profiles` row on `auth.users` insert, plus a one-time backfill `insert into profiles(user_id) select id from auth.users on conflict do nothing`.
  - Shared trigger `set_updated_at()`.
- Produces (test helpers in `tests/integration/helpers.ts`): `adminClient(): SupabaseClient`, `createTestUser(tag: string): Promise<{ id: string; email: string; client: SupabaseClient }>` (creates user `pipeline-test+<tag>-<rand>@example.test` via the admin API (Task 4 makes it insert an invite first), signs it in via `auth.admin.generateLink({type:'magiclink'})` + `verifyOtp({token_hash, type:'magiclink'})`, and returns a user-scoped client), `deleteTestUser(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** `rls-user-tables.test.ts`:
  - `it('user A cannot read or write user B rows')`: A inserts a `contacts` row. B selects `contacts` and gets `[]`. B updates A's row by id and 0 rows change. Repeat for `applications` and `experience_items`.
  - `it('creating a user creates a profile')`: a new user selects their own profile and gets exactly 1 row with `onboarding_step === 0`.
  - `it('global default resume rules are readable, not writable')`: an admin inserts a `resume_rules` row with `user_id null`. A can select it, and A's update affects 0 rows.
  - `it('backfill covered pre-existing users')`: an admin counts `auth.users` without a profile and gets `0`.
- [ ] **Step 2:** Run `npx vitest run tests/integration/rls-user-tables.test.ts`. Expected: FAIL (relation does not exist).
- [ ] **Step 3: Write the migration.** RLS policy shape: `using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))` for all operations. `resume_rules` additionally allows select where `user_id is null`. `user_companies.company_id` stays a plain uuid until Task 3 adds the FK.
- [ ] **Step 4:** Push with `supabase db push` (linked/remote flag per `--help`), then re-run the test. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(db): per-user tables with RLS and profile trigger`

### Task 3: Global tables, matches and AI queue

**Files:**
- Create: `supabase/migrations/20261107000200_global_tables.sql`
- Test: `tests/integration/rls-global-tables.test.ts`

**Interfaces:**
- Produces:
  - `companies`: `name`, `normalized_name` unique, `aliases text[]`, `ats` enum `greenhouse|lever|ashby|smartrecruiters|recruitee|rippling|personio|workable|workday|other|unknown`, `ats_token text`, `ats_meta jsonb` (e.g. Workday tenant/site/wd number), `regions text[]`, `is_fortune500 bool`, `industry`, `coverage` enum `covered|not_covered|unknown`, `coverage_reason`.
  - `postings`: `company_id references companies`, `company_name`, `title`, `locations text[]`, `remote` enum `onsite|hybrid|remote|unknown`, `apply_url`, `posted_date date`, `first_seen timestamptz`, `last_seen timestamptz`, `pay_min_cents`, `pay_max_cents`, `pay_period`, `season` text, `level` enum `internship|new_grad|experienced|unknown`, `snippet text` (≤ 1,000 chars, check constraint), `status` enum `new|seen|gone`, `dedupe_key text unique`.
  - `posting_sources`: `posting_id on delete cascade`, `source` text, `source_url`, `external_id`, `first_seen`, `last_seen`, unique (`source`, `external_id`).
  - `posting_matches` (per user): `user_id`, `posting_id`, `passed_filter bool`, `filter_reasons text[]`, `base_score numeric`, `ai_score numeric null`, `reasons jsonb`, `bar_verdict` enum `beats|does_not_beat|no_bar` default `'no_bar'`, `confirm_pay bool`, `state` enum `new|saved|hidden|applied`, unique (`user_id`, `posting_id`).
  - `ai_jobs` (per user): `kind` enum `score_fit|tailor_resume|draft_outreach|parse_resume`, `input jsonb`, `status` enum `queued|claimed|done|failed`, `result jsonb`, `error text`, `claimed_by text`, `claimed_at`, `completed_at`.
  - `finder_runs`: `started_at`, `finished_at`, `trigger` text, `totals jsonb`. `finder_run_items`: `run_id on delete cascade`, `source`, `company_id null`, `fetched int`, `new int`, `seen int`, `gone int`, `status` enum `ok|failed|skipped`, `error`.
  - `schools`: `name`, `state`. `school_companies`: `school_id`, `company_id`, `relation` text, `source` text.
  - Adds FK `user_companies.company_id → companies(id)`, plus `contacts.company_id` and `applications.posting_id` FKs (`on delete set null`).
- RLS: global tables (`companies`, `postings`, `posting_sources`, `finder_runs`, `finder_run_items`, `schools`, `school_companies`) get `select` for `authenticated` and no insert/update/delete policy, so only the service role can write. `posting_matches` and `ai_jobs` use the per-user policy from Task 2, except that users may only **insert** `ai_jobs` with `status='queued'` and may not update `status`/`result` (enforce with a column-limited update policy or a trigger; builder's choice, but the test pins the behavior).

- [ ] **Step 1: Write the failing test** `rls-global-tables.test.ts`:
  - `it('authenticated users can read postings but not write them')`: an admin inserts a company and a posting. User A selects and gets 1 row. A's insert into `postings` returns an RLS error. A's update affects 0 rows.
  - `it('posting_matches are private')`: an admin inserts a match for A. B selects and gets `[]`.
  - `it('users can queue AI jobs but cannot complete them')`: A inserts `{kind:'score_fit', input:{}}` and gets `status === 'queued'`. A's update setting `status='done'` either errors or leaves status `queued`.
  - `it('snippet longer than 1000 chars is rejected')`: an admin inserts a 1,001-char snippet and gets an error.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Push, then re-run Task 2's and Task 3's tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(db): global postings tables, matches, AI queue`

### Task 4: Invite-only signup hook and invite script

**Files:**
- Create: `supabase/migrations/20261107000300_invites.sql`
- Modify: `supabase/config.toml` (`[auth.hook.before_user_created] enabled = true`, `uri = "pg-functions://postgres/public/hook_require_invite"`; set `site_url` and `additional_redirect_urls` to include `http://localhost:3000/**` and the Vercel production URL `/**`)
- Create: `scripts/invite.ts` (run with `npx tsx scripts/invite.ts <email> [--note "..."]`)
- Test: `tests/integration/invites.test.ts`

**Interfaces:**
- Produces: table `invites` (`email citext primary key` or `text` with a unique index on `lower(email)`, `invited_at`, `note`, `accepted_at null`). RLS enabled with **no** policies, so it's service role only. Function `public.hook_require_invite(event jsonb) returns jsonb`: returns `'{}'` if `lower(event->'user'->>'email')` is in invites; otherwise `{"error":{"http_code":403,"message":"Pipeline is invite-only. Ask for an invite."}}`. Grant execute and select to `supabase_auth_admin`, and revoke from `anon, authenticated, public`. A trigger on `profiles` insert sets `invites.accepted_at`.
- Produces: `tests/integration/helpers.ts#createTestUser` now inserts the invite before creating the user. Update the helper, and make `deleteTestUser` also delete the invite.

- [ ] **Step 1: Write the failing test** `invites.test.ts`:
  - `it('rejects an uninvited email')`: `admin.auth.admin.createUser({email: 'nobody-<rand>@example.test', email_confirm: true})` returns an error whose message contains `invite-only`.
  - `it('accepts an invited email regardless of case')`: insert invite `case-<rand>@example.test`. Creating `Case-<rand>@Example.TEST` succeeds.
  - `it('marks the invite accepted')`: after creation, `invites.accepted_at` is not null.
- [ ] **Step 2:** Run it. Expected: FAIL (the uninvited user gets created).
- [ ] **Step 3:** Write the migration and config. Push the migration. Push the auth config with `supabase config push`, or if CLI 3.0 can't push hooks, enable the hook in the dashboard (Authentication → Hooks → Before User Created → Postgres function `hook_require_invite`) and record which method worked in `DECISIONS.md`.
- [ ] **Step 4:** Insert the project owner's invite through `scripts/invite.ts`, using the email the user gives in chat. **Don't hard-code the owner's email in the repo.** Re-run all integration tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(auth): invite-only signup via before_user_created hook`

### Task 5: Supabase clients, session proxy and sign-in UI

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`
- Create: `src/lib/safe-next.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/app/auth/signout/route.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`
- Test: `tests/unit/env.test.ts`, `tests/unit/safe-next.test.ts`, `tests/e2e/auth.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Produces: `publicEnv` (zod-parsed `NEXT_PUBLIC_SUPABASE_URL` as URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` non-empty, `NEXT_PUBLIC_SITE_URL` as URL) and `serverEnv()` (adds `SUPABASE_SECRET_KEY`; lives in a `server-only` module).
- Produces: `createClient(): Promise<SupabaseClient<Database>>` (server, cookies via `next/headers`), `createBrowserClient()` (client), `createAdminClient()` (server-only, secret key, `auth: { persistSession: false }`), and `updateSession(request: NextRequest): Promise<NextResponse>` (follow the current Supabase Next.js example: `getClaims()` immediately after `createServerClient`). `src/proxy.ts` exports `proxy` and a matcher that skips static assets.
- Produces: `safeNext(raw: string | null | undefined, fallback = '/dashboard'): string`.
- Behavior: unauthenticated requests to `(app)` routes redirect to `/login?next=<path>`. `/login` offers "Continue with Google" (`signInWithOAuth`, `redirectTo: ${SITE_URL}/auth/callback?next=…`) and "Email me a sign-in link" (`signInWithOtp`, `shouldCreateUser: true`; the hook still enforces invites). A rejected signup shows "Pipeline is invite-only. Ask for an invite." The dashboard placeholder shows the signed-in email and a sign-out button. (The real dashboard comes in Phase 2; keep styling minimal and on-brand, not templated.)

- [ ] **Step 1: Write the failing unit tests.**
  - `env.test.ts`: a missing URL throws, mentioning `NEXT_PUBLIC_SUPABASE_URL`; a valid set parses.
  - `safe-next.test.ts`:
    - `safeNext('/dashboard?x=1')` → `'/dashboard?x=1'`
    - `safeNext('https://evil.com')` → `'/dashboard'`
    - `safeNext('//evil.com')` → `'/dashboard'`
    - `safeNext('/\\evil.com')` → `'/dashboard'`
    - `safeNext(null)` → `'/dashboard'`
    - `safeNext('dashboard')` → `'/dashboard'`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `env.ts` and `safe-next.ts`. Read current `@supabase/ssr` and Next 16 proxy docs via Context7, then implement the clients, the proxy and the routes. `/auth/callback` exchanges `code` for a session. `/auth/confirm` verifies `token_hash` + `type`. Both redirect to `safeNext(next)`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Write `tests/e2e/auth.spec.ts`** (Playwright, `webServer: npm run dev`, baseURL `http://localhost:3000`):
  - `test('signed-out user is sent to login and back')`: visit `/dashboard` → URL is `/login?next=%2Fdashboard`. Create a test user via the helper, use `admin.generateLink({type:'magiclink'})` to get `hashed_token`, visit `/auth/confirm?token_hash=…&type=magiclink&next=/dashboard`, and expect the page to contain the user's email.
  - `test('sign out returns to login')`: after signing in, click "Sign out", expect URL `/login`, and expect visiting `/dashboard` to redirect again.
  - `test('next cannot redirect off-site')`: visit `/auth/confirm?…&next=https://evil.com` and expect the final URL to start with baseURL.
- [ ] **Step 6:** Run `npx playwright install chromium && npm run test:e2e`. Expected: PASS.
- [ ] **Step 7: Commit.** `feat(auth): Supabase SSR sessions, proxy, login and callback routes`

### Task 6: Generated types and cascade check

**Files:**
- Create: `src/lib/database.types.ts` (generated), npm script `db:types`
- Modify: `src/lib/supabase/*.ts` to use `Database`
- Test: `tests/integration/cascade.test.ts`

**Interfaces:**
- Produces: `Database` type exported from `@/lib/database.types`. Script `db:types` runs `supabase gen types typescript` against the linked project (use the correct flag from `--help`) and writes `src/lib/database.types.ts`.

- [ ] **Step 1: Write the failing test** `cascade.test.ts`: `it('deleting a user removes all their rows')`. Create a user and insert one row each into `contacts`, `applications` (+1 `application_events`), `tasks`, `experience_items`, `posting_matches`, `ai_jobs` and `bars`. Delete the user via admin. Admin counts per table for that `user_id` are all `0`, and the `profiles` row is gone.
- [ ] **Step 2:** Run it. Expected: PASS if Tasks 2–3 used cascade everywhere. If it fails, fix the FK in a new migration (never edit a pushed migration).
- [ ] **Step 3:** Run `npm run db:types`, wire `Database` into the clients, then run `npm run typecheck`. Expected: exit 0.
- [ ] **Step 4: Commit.** `chore(db): generated types and cascade test`

### Task 7: Public repo, CI and Vercel deploy

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/check-bundle-secrets.mjs`
- Modify: `README.md` (what it is, invite-only, how to run, link to spec), `DECISIONS.md`, `CLAUDE.md`

**Interfaces:**
- Produces: CI on `push`/`pull_request` to `main`, running on Node 24: `npm ci`, `lint`, `typecheck`, `test` (unit only, `tests/unit`; integration tests need secrets and run only on `push` to `main` with repo secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`), `build`, then `node scripts/check-bundle-secrets.mjs`.
- `check-bundle-secrets.mjs`: exits 1 if any file under `.next/static` contains the literal value of `process.env.SUPABASE_SECRET_KEY` (when set) or the string `SUPABASE_SECRET_KEY`.

- [ ] **Step 1:** Write `check-bundle-secrets.mjs`. Run `npm run build && SUPABASE_SECRET_KEY=$(grep ^SUPABASE_SECRET_KEY .env.local | cut -d= -f2-) node scripts/check-bundle-secrets.mjs`. Expected: exit 0. Sanity-check that it catches a leak: temporarily reference the secret in a client component, confirm exit 1, then revert.
- [ ] **Step 2:** Before creating the public repo, scan history and tree for personal data or secrets: `git log -p | grep -iE 'secret|password|sb_secret|fc-'` must find no values. **Ask the user to confirm the repo name** (default `emandhar4/pipeline`), then run `gh repo create <name> --public --source . --push`. Set the repo secrets with `gh secret set` (values piped from `.env.local`, never echoed).
- [ ] **Step 3:** Set Vercel env vars for production and preview (`vercel env add`): the three Supabase vars and `NEXT_PUBLIC_SITE_URL=<production URL>`. Connect the GitHub repo to the Vercel project (`vercel git connect`) and deploy with `vercel --prod`.
- [ ] **Step 4:** Add the production URL to Supabase Auth `site_url`/redirect URLs and push the config. Manual step for the user, with exact instructions: create a Google Cloud OAuth client (Web), with authorized redirect `https://lxrtmkipbtdwjercczmt.supabase.co/auth/v1/callback`, then paste the client ID and secret into Supabase → Authentication → Providers → Google. Until that's done, Google sign-in shows an error and the owner uses magic-link email.
- [ ] **Step 5: Verify.** CI is green on GitHub (`gh run list --limit 1`). On the production URL, the owner signs in by magic link and sees their email on `/dashboard`. Check with the built-in browser or Playwright. An uninvited email gets the invite-only message.
- [ ] **Step 6:** Run the `claude-code-setup:claude-automation-recommender` skill on the repo. Bring its recommendations to the user and apply only the ones they approve.
- [ ] **Step 7: Commit and push.** `chore: CI, bundle secret check, deploy config`

## Phase 1 demo (show the user before Phase 2)

- Production URL; sign in; dashboard placeholder with your email; sign out.
- An uninvited email is rejected.
- Supabase table list with RLS on, and the integration test run output.
- Green CI run on the public repo.
