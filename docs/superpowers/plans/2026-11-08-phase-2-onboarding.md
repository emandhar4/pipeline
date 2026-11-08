# Phase 2: Onboarding and Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user finishes onboarding steps 1–2 ("Who you are", "What you want") in about 2 minutes. They then land on a real dashboard with three panels (Today, New postings worth it, Pipeline health). The panels read the user's own rows and show honest empty states until later phases fill them.

**Architecture:**
- Onboarding is a two-step flow at `/onboarding`. Each step is a server-rendered form posting to a server action. Each action validates with a shared zod schema, calls `getCurrentUser()`, and writes through the user's RLS-scoped Supabase client.
- `profiles.onboarding_step` gates the dashboard: below 2 redirects to `/onboarding`.
- A new global `field_categories` table holds the category vocabulary (seeded from intern-list.com's 21 categories).
- Dashboard panels are server components. They call pure, unit-tested helper functions over rows fetched with the user's client.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components, server actions), React 19, Tailwind 4, Supabase (`@supabase/ssr`), zod 4, Vitest 5, Playwright 1.65.

**Spec:** `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§3.1, §3.2 steps 1–2, §5, §6 Phase 2).

## Global Constraints

- **Real data only (user decision, 2026-11-08).** No fictional seed rows in any shared table. The dashboard shows the user's real rows and empty states. This replaces the spec's "dashboard shell with fictional seed data" for Phase 2. Record it in `DECISIONS.md` and the spec.
- Nothing about the first user is hard-coded. Defaults and option lists must suit any major, career stage or field.
- Every route handler, page that reads data, and server action calls `getCurrentUser()` itself (CLAUDE.md working rule).
- Writes go through the user's RLS-scoped client (`src/lib/supabase/server.ts`). The admin client is never used in app code paths.
- `profiles` is updatable only on its granted columns (migration `20261108000100`). Never write `ai_mode`.
- Migrations target the hosted project. Run `npx supabase db push --remote --dry-run` before `--remote --yes`. After a schema change, run `npm run db:types`.
- Integration and e2e tests touch only their own `@example.test` users and delete them in `afterAll`.
- The UI must not look templated (frontend-design guidance). Reuse the tokens and component classes in `src/app/globals.css`: `.field`, `.btn-primary`, `.btn-secondary`, `.wordmark`, and the colors `background`/`foreground`/`muted`/`line`/`accent`/`danger`. Light and dark both work. It must work at phone width (375px).
- Use Context7 for current Next 16 / Supabase / zod 4 docs. Read `node_modules/next/dist/docs/` for server actions and forms.

## Review Focus

1. **A half-finished onboarding (left after step 1)** resumes at step 2, and the dashboard still redirects. Expected: no crash, and step 1 answers are kept. Test: e2e "resume at step 2".
2. **Re-submitting step 2 with fewer fields** replaces the field set; it does not append duplicates. Test: integration "step 2 save replaces fields".
3. **Duplicate field labels or industries differing only in case** ("Consulting" vs "consulting") are rejected or merged, not stored twice. Test: unit test on the schema normalizer, plus the DB unique index.
4. **Pay floor edge cases** (blank = no floor, `0`, decimals, hourly vs yearly) are stored as integer cents with a period, and a blank stores nulls. Test: unit "parsePayFloor".
5. **One user's onboarding writes** never touch another user's rows. Test: integration "user B cannot read or overwrite A's profile_fields".

---

### Task 1: Field categories and onboarding constraints (migration)

**Files:**
- Create: `supabase/migrations/20261108000200_onboarding.sql`
- Modify: `src/lib/database.types.ts` (regenerated), `DECISIONS.md`, `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§6 Phase 2 line: real data only)
- Test: `tests/integration/onboarding-schema.test.ts`

**Interfaces:**
- Produces:
  - Table `public.field_categories(slug text pk, name text not null unique, sort int not null, source text not null default 'intern-list')`. RLS on, select for `authenticated`, no write grants. Seeded with these 21 rows, slugs kebab-case of the name, `sort` in this order: Software Engineering, Data Analysis, Machine Learning and AI, Product Management, Accounting and Finance, Engineering and Development, Business Analyst, Marketing, Cybersecurity, Consulting, Creatives and Design, Management and Executive, Public Sector and Government, Legal and Compliance, Human Resources, Arts and Entertainment, Sales, Customer Service and Support, Education and Training, Healthcare, Supply Chain.
  - `profile_fields`:
    - `category` becomes `category_slug text references field_categories(slug)`. Use a rename + FK; existing rows are expected to be zero, so check and fail loudly if not.
    - `label text not null`, `weight not null`.
    - Unique index on `(user_id, lower(label))`.
  - `profile_industries`: `industry text not null`, `preference not null`, unique index on `(user_id, lower(industry))`.
  - `profiles`: check constraints:
    - `work_auth in ('citizen_or_pr','no_sponsorship_needed','needs_sponsorship')` or null
    - `pay_floor_cents >= 0`
    - `onboarding_step between 0 and 6`

- [ ] **Step 1: Write the failing tests** in `tests/integration/onboarding-schema.test.ts`, using `createTestUser`/`deleteTestUser`:
  - `field_categories has the 21 seeded categories, readable by a user`: select count = 21, and it includes slug `supply-chain`.
  - `users cannot write field_categories`: an insert by the user client returns an error.
  - `profile_fields rejects a case-duplicate label for the same user`: insert `{label:'Consulting', weight:'primary', category_slug:'consulting'}` then `{label:'consulting', weight:'secondary'}`; the second has error code `23505`.
  - `profile_fields requires weight`: insert without weight returns error code `23502`.
  - `user B cannot read or overwrite A's profile_fields`: B's select returns 0 rows, and B's update by id affects 0 rows (re-read as admin, unchanged).
  - `profiles rejects unknown work_auth`: update `work_auth='x'` returns error code `23514`.
- [ ] **Step 2:** Run `npx vitest run tests/integration/onboarding-schema.test.ts`. Expected: FAIL (table/columns missing).
- [ ] **Step 3:** Write the migration. Dry run, then push (`--remote`). Run `npm run db:types`.
- [ ] **Step 4:** Run the test file again. Expected: PASS. Then run `npm test`; all pass.
- [ ] **Step 5:** In `DECISIONS.md`, add "Phase 2 uses real data only (no fictional seed in shared tables)" and the category vocabulary source (intern-list.com, 2026-11-08). In the spec, update the §6 Phase 2 line to match.
- [ ] **Step 6:** Commit `feat(db): field categories and onboarding constraints`.

### Task 2: Onboarding domain library

**Files:**
- Create: `src/lib/onboarding/schema.ts`, `src/lib/onboarding/options.ts`, `src/lib/onboarding/profile.ts` (server-only)
- Test: `tests/unit/onboarding-schema.test.ts`, `tests/unit/onboarding-options.test.ts`

**Interfaces:**
- Consumes: `Database` types (Task 1), `createClient` from `src/lib/supabase/server.ts`, `getCurrentUser()`.
- Produces:
  - `options.ts` (pure):
    - `CAREER_STAGES`, `WORK_AUTH`, `RELOCATE`: arrays of `{ value, label }` matching the DB enums and the check.
    - `seasonOptions(today: Date): string[]` returns the next 6 terms (Spring/Summer/Fall plus year), starting with the next term that has not started, and then `"Full-time"`. Term starts: Spring = Jan 1, Summer = May 1, Fall = Aug 15.
    - `parsePayFloor(amount: string, period: 'hour'|'year'): { cents: number|null; period: 'hour'|'year'|null }`.
  - `schema.ts` (zod 4, pure):
    - `step1Schema`: career_stage, school, major, grad_date (YYYY-MM), work_auth, home_location, school_location, in_state_school, relocate. Trimmed strings with max lengths.
    - `step2Schema`:
      - `fields: { category_slug: string|null; label: string; weight: 'primary'|'secondary' }[]`, with 1 to 12 items and at least one primary.
      - `industries: { industry: string; preference: 'prefer'|'avoid' }[]`, with at most 20.
      - `pay_amount`, `pay_period`, `season`.
    - `normalizeFields(fields)` and `normalizeIndustries(items)` dedupe case-insensitively, keeping the first.
  - `profile.ts` (server-only):
    - `getOnboardingState(): Promise<{ step: number; profile: ProfileRow; fields: FieldRow[]; industries: IndustryRow[] }>`
    - `saveStep1(input: Step1): Promise<void>` sets `onboarding_step = max(current, 1)`.
    - `saveStep2(input: Step2): Promise<void>`:
      - Replace the user's `profile_fields` and `profile_industries` with the normalized sets. Delete then insert.
      - Set the pay/season columns and `onboarding_step = max(current, 2)`.
      - Throw on any Supabase error. Never swallow it.
  - `grad_date` (YYYY-MM from the form) is stored as the first of that month. The step 2 replace is delete-then-insert, not one transaction; note that in `DECISIONS.md` (acceptable for one user editing their own profile).

- [ ] **Step 1: Write the failing unit tests:**
  - `seasonOptions(new Date('2026-11-08'))` equals `['Spring 2027','Summer 2027','Fall 2027','Spring 2028','Summer 2028','Fall 2028','Full-time']`. On `2027-05-01` the list starts with `'Fall 2027'`.
  - `parsePayFloor` returns:
    - `('', 'year')` → `{cents:null, period:null}`
    - `('0','hour')` → `{cents:0, period:'hour'}`
    - `('22.50','hour')` → `{cents:2250, period:'hour'}`
    - `('85,000','year')` → `{cents:8500000, period:'year'}`
    - `('abc','year')` throws.
  - `step2Schema` rejects zero fields, rejects all-secondary fields, and accepts 1 primary + 1 secondary.
  - `normalizeFields` keeps one of `Consulting`/`consulting ` (trimmed, first wins).
  - `step1Schema` rejects `grad_date: '2027-13'` and accepts `'2027-05'`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/onboarding-*.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `options.ts` and `schema.ts`.
- [ ] **Step 4:** Implement `profile.ts`. Add an integration test in `tests/integration/onboarding-profile.test.ts` for `step 2 save replaces fields`:
  - Call the same Supabase operations `saveStep2` uses, through a test user's client. Extract the DB calls into `applyStep2(client, userId, input)` so the test can call them with a client.
  - Save 3 fields, then 1 field. Expect exactly 1 row.
- [ ] **Step 5:** Run the unit tests and the new integration test. Expected: PASS. Then run `npm test`.
- [ ] **Step 6:** Commit `feat(onboarding): schema, options and profile persistence`.

### Task 3: Onboarding UI and dashboard gate

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/onboarding/actions.ts`, `src/app/(app)/onboarding/step-one-form.tsx`, `src/app/(app)/onboarding/step-two-form.tsx`, `src/app/(app)/profile/page.tsx`
- Modify: `src/app/(app)/layout.tsx` (header nav: Dashboard, Profile, Sign out), `src/app/(app)/dashboard/page.tsx` (redirect to `/onboarding` when `step < 2`), `src/app/globals.css` (only new component classes if needed)
- Test: `tests/e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: Task 2's `getOnboardingState`, `saveStep1`, `saveStep2`, `step1Schema`, `step2Schema`, the options, and `field_categories` (select ordered by `sort`).
- Produces: routes `/onboarding` (shows step 1 or step 2 based on `onboarding_step`; `?step=1` lets the user go back) and `/profile` (both forms prefilled, saving returns to `/profile` with a "Saved" status).

Behavior:
- **Step 1:** one screen, with a progress marker "1 of 2".
  - In-state is a yes/no shown only when both locations are filled.
  - Submit → step 2.
- **Step 2:**
  - Category chips. Tapping cycles off → primary → secondary → off, with a visible legend.
  - A "+ add your own" free-text field adds a chip with `category_slug = null`.
  - Industries are two chip inputs, "Prefer" and "Avoid".
  - Pay floor is an amount with an hour/year toggle, and a hint that blank means no floor.
  - Season is a select from `seasonOptions(today)`.
  - Submit → `/dashboard`.
- **Errors:** validation errors show inline next to the field (`useActionState`). Server errors show a short message; they are never silent.
- **Accessibility:** the chips are real buttons with `aria-pressed`, and every field has a label.
- Use the `frontend-design:frontend-design` skill before building the forms.

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/onboarding.spec.ts`, reusing the `signIn` / `createTestUser` pattern from `tests/e2e/auth.spec.ts`. Move `newUser`/`signIn` into `tests/e2e/helpers.ts` and import them in both files.
  - `new user is sent to onboarding and finishes in two steps`:
    1. Sign in → URL `/onboarding`. Fill step 1 → "2 of 2" visible.
    2. Mark "Data Analysis" primary and "Supply Chain" secondary. Add an industry to Prefer. Leave pay blank. Pick the first season. Submit.
    3. URL `/dashboard`, heading "Today" visible.
  - `resume at step 2`: sign in, complete step 1, go to `/dashboard` → redirected to `/onboarding` showing "2 of 2" with step 1 values kept (`?step=1` shows them).
  - `step 2 requires a primary field`: submit with only a secondary → inline error text "Pick at least one primary field", and the URL stays.
  - `profile edits persist`: after onboarding, open `/profile`, change major, save → reload shows the new value.
- [ ] **Step 2:** Run `npm run test:e2e -- onboarding`. Expected: FAIL.
- [ ] **Step 3:** Implement the pages, forms and actions. Each action calls `getCurrentUser()`, parses with the schema, calls `save*`, then `redirect`. Wrap data reads in `<Suspense>` as the existing pages do (Cache Components).
- [ ] **Step 4:** Run the e2e tests. Expected: PASS. Then run `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Step 5:** Check `/onboarding` at 375px and 1280px, in light and dark, using Playwright screenshots. Fix any overflow.
- [ ] **Step 6:** Commit `feat(onboarding): two-step onboarding, profile page, dashboard gate`.

### Task 4: Dashboard shell with real-data panels

**Files:**
- Create: `src/lib/dashboard/today.ts`, `src/lib/dashboard/health.ts`, `src/lib/dashboard/queries.ts` (server-only), `src/app/(app)/dashboard/today-panel.tsx`, `postings-panel.tsx`, `health-panel.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Test: `tests/unit/dashboard-today.test.ts`, `tests/unit/dashboard-health.test.ts`, `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `tasks`, `posting_matches` (joined to `postings`), `applications` (user-scoped selects), and `getOnboardingState()`.
- Produces (pure functions):
  - `rankToday(tasks: TaskRow[], now: Date): TaskRow[]`:
    - Includes open tasks, plus snoozed tasks whose `snoozed_until <= now`.
    - Orders by overdue first, then `due_at` ascending (nulls last), then kind priority `interview > assessment > closing_soon > follow_up > outreach > onboarding > other`.
  - `funnel(apps: AppRow[]): { stage: 'applied'|'screened'|'interviewed'|'final'|'offer'; count: number }[]`. A stage counts every application that reached it or a later stage, so `closed` applications count toward the stage they reached before closing. Use the last stage from `application_events` when it's available; otherwise use `stage`, and treat `closed` with no events as `applied`.
  - `channelConversion(apps): { cold: { applied: number; advanced: number }; referral: {...} }`. "Advanced" means reached `screened` or later.
  - `agingOut(apps, now): { stale: AppRow[]; noResponse: AppRow[] }`:
    - Covers stages `applied`/`screened`/`interviewed`/`final` with `outcome` null.
    - `stale` means 30–44 days since `last_activity_at`; `noResponse` means 45 or more.
    - It never labels anything "rejected".

Panels:
- **Today:** the ranked list. Empty state: "Nothing due. New tasks appear here as you apply and hear back."
- **New postings worth it:** non-hidden matches ordered by score. Empty state: "Your first search runs when the daily finder goes live. Your fields: <primary labels>." The empty state proves the profile is wired in.
- **Pipeline health:** funnel bars, cold vs. referral conversion, and an aging list. Empty state shows zeros with "Applications you add will show up here." (no phase numbers in user-facing copy).
- On a phone the three panels stack. On desktop, Today and New postings sit side by side, and Health spans the full width below. No chart library: use CSS bars.

- [ ] **Step 1: Write the failing unit tests:**
  - `rankToday`:
    - an overdue `follow_up` comes before a future `interview`
    - a snoozed task with a future `snoozed_until` is excluded, and one with a past `snoozed_until` is included
    - ties are ordered by kind priority
  - `funnel`: apps at applied, screened, offer, and closed-after-interviewed (via events) → applied 4, screened 3, interviewed 2, final 1, offer 1.
  - `channelConversion`: 2 cold (1 screened) and 1 referral (applied) → `{cold:{applied:2,advanced:1}, referral:{applied:1,advanced:0}}`.
  - `agingOut`:
    - 29 days → neither; 30 → stale; 44 → stale; 45 → noResponse
    - `outcome='rejected'` → neither
    - `stage='offer'` → neither
- [ ] **Step 2:** Run `npx vitest run tests/unit/dashboard-*.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `today.ts` and `health.ts`. Then implement `queries.ts`: user-client selects only, and every function calls `getCurrentUser()`.
- [ ] **Step 4:** Implement the panels and the page, with `<Suspense>` per panel and skeleton fallbacks.
- [ ] **Step 5:** Write `tests/e2e/dashboard.spec.ts`:
  1. Onboard a test user (reuse the helpers).
  2. Insert one application as admin for that user: stage `applied`, `last_activity_at` 31 days ago.
  3. Reload `/dashboard`. Expect the Health panel to show "applied 1" and the application under "Going stale".
  4. Expect the postings panel empty state to name the primary field label.
- [ ] **Step 6:** Run the unit tests and e2e. Expected: PASS. Then run `npm run lint && npm run typecheck && npm test && npm run build`. Take screenshots at 375px and 1280px.
- [ ] **Step 7:** Commit `feat(dashboard): Today, postings and pipeline health panels`.

### Task 5: Ship and owner onboarding

**Files:**
- Modify: `README.md` (what Phase 2 adds), `CLAUDE.md` (where onboarding and dashboard code live), `DECISIONS.md`

- [ ] **Step 1:** Push the branch. CI must be green (`gh run watch --exit-status`).
- [ ] **Step 2:** Deploy with `vercel --prod` (or let git integration deploy, if the user connected it). On the production URL, check:
  - signed out: `/onboarding` redirects to `/login`
  - security headers are present (`curl -sI`)
- [ ] **Step 3:** Hand off to the user: they sign in on production and complete onboarding with their real data. This is the Phase 2 demo. Do not enter their data for them.
- [ ] **Step 4:** Commit the docs updates as `docs: Phase 2 notes`.

## Phase 2 demo (show the user before Phase 3)

- A new test user is sent to `/onboarding`, finishes both steps in about 2 minutes, and lands on the dashboard (e2e video or screenshots).
- The owner's own dashboard after onboarding with real data. The panels show real (empty) state and name their primary fields.
- The `/profile` edit flow.
- Green CI, and all integration tests passing.
