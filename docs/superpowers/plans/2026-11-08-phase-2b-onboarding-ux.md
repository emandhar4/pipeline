# Phase 2b: Onboarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding that fits the first user's feedback. School and major narrow as you type. "Where can you work?" is a concrete set of US states plus a separate remote answer. An optional first step reads a resume PDF and pre-fills the forms. The user confirms everything before it is saved.

**Architecture:**
- Two global lookup tables, `schools` (College Scorecard) and `majors` (trimmed CIP 2020). They are seeded by migrations that one-time local scripts generate from public-domain US government data, and searched through `security invoker` SQL functions.
- A small accessible combobox (no new UI dependency) calls lookup server actions. Free text is always allowed.
- Relocation moves from the `relocate_pref` enum to structured columns (`home_state`, `school_state`, `work_states`, `work_anywhere_us`, `work_countries`, `open_to_remote`). It uses expand → switch code → contract: new columns and backfill first, the enum is dropped last.
- Resume: the browser uploads the PDF straight to a private Storage bucket (RLS by `auth.uid()` folder). A server action downloads it with the user's client, extracts text with `unpdf`, and runs a deterministic keyword reader. It stores the suggestions on the `resumes` row only. The step 1 and step 2 forms are pre-filled from those suggestions, and nothing reaches `profiles`/`profile_fields` until the user submits the forms.
- No LLM calls. Spots where the Anthropic API plugs in later are marked `LLM-UPGRADE` in code and listed in `DECISIONS.md`.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components, server actions), React 19, Tailwind 4, Supabase (Postgres 17, Storage, `@supabase/ssr`), zod 4, `unpdf` (new, MIT), `pdf-lib` (new, dev-only, MIT, test fixtures), Vitest 5, Playwright 1.65.

**Spec:** `docs/superpowers/specs/2026-11-07-pipeline-design.md` (§3.2 steps 1–2 and 4, §4 AI layer, §5 `profiles`/`resumes`/`schools`), plus `DECISIONS.md` → "Phase 2b: onboarding UX". The decisions there override the spec where they differ.

## Global Constraints

- Branch: `phase-2-onboarding` (Phase 2 code at 229f4e2). Commit per task. Do not push to `main`; the user opens and merges PRs and runs `vercel --prod` themselves.
- **No LLM / Anthropic API code, dependency or env var in this phase.** `grep -ri anthropic src package.json` must return nothing at the end. Mark plug-in spots with a `// LLM-UPGRADE:` comment.
- Nothing about the first user is hard-coded. Lists, keywords and copy must suit any major, career stage and field.
- No personal data in the repo. Test resumes are fictional and generated in code. Committed seed data is public-domain government data only.
- Every server action and route handler calls `getCurrentUser()` itself. App code writes through the user's RLS client (`src/lib/supabase/server.ts`), never the admin client.
- Every new per-user surface has RLS keyed to `auth.uid()`. Global tables (`schools`, `majors`) are `select` for `authenticated` only, with no grants to `anon`.
- `profiles` stays column-granted: add the new columns to the `update` grant. Never grant `ai_mode`.
- Migrations target the hosted project, which holds real data. Run `npx supabase db push --linked --dry-run`, read it, then push. Check flags with `npx supabase db push --help` (CLI 3.0). Run `npm run db:types` after each schema change. No Docker.
- Free tiers only. The College Scorecard API key (free, from api.data.gov, which **the user** signs up for) is used only by the local seed generator, read from `.env.local` as `SCORECARD_API_KEY`. It never goes to Vercel, CI or the repo.
- Integration and e2e tests touch only their own `@example.test` users and delete them, **including their Storage objects**, in `afterAll`. Supabase auth rate-limits sign-ups: reuse users within a file, and run integration files one at a time locally.
- UI: reuse `src/app/globals.css` tokens and classes (`.field`, `.btn-primary`, `.btn-secondary`, colors `background`/`foreground`/`muted`/`line`/`accent`/`danger`). Light and dark. Works at 375px. Follow the frontend-design guidance; nothing templated.
- Use Context7 before writing against Supabase Storage, `unpdf`, `pdf-lib`, zod 4 or Next 16 server actions. Read `node_modules/next/dist/docs/` for server-action specifics.
- US scope: `US_STATES` is the 50 states plus DC. Territories are a known gap, to be recorded in `DECISIONS.md`.

## Review Focus

1. **The first user's existing profile** (saved under the old `relocate` enum) opens on `/profile` with sensible migrated selections and can be saved without errors. Test: integration `us_state_from_location` cases (Task 4), plus e2e "profile edits persist" against migrated shape (Task 5).
2. **A school or major not in the list** (typo, foreign school, new program) saves as free text with a null id. A forged or stale `school_id`/`major_cip` is rejected with a message, not saved. Test: integration `resolveStepOneLookups` (Task 5).
3. **A bad upload:** a scanned PDF with no text, a non-PDF renamed `.pdf`, a password-protected PDF, an over-5 MB file, or a 40-page PDF. Each gets a plain message, nothing is saved to the profile, and the user can still skip. Test: unit `extractPdfText` cases (Task 8), integration bucket size/mime limits (Task 7).
4. **Resume suggestions never overwrite answers the user already gave, and never save on their own.** Re-uploading with a filled profile changes nothing until submit. Test: unit `prefillStepOne`/`prefillStepTwo` (Task 9), integration "processResume leaves profiles untouched" (Task 8).
5. **Contradictory location answers:** "Anywhere in the US" plus specific states, nothing picked with remote "No", a forged state code `ZZ`, or `US` typed as a country. Test: unit `step1Schema` (Task 4).

---

### Task 1: Regions vocabulary (pure)

**Files:**
- Create: `src/lib/onboarding/regions.ts`
- Test: `tests/unit/onboarding-regions.test.ts`

**Interfaces:**
- Produces:
  - `type UsState` (union of the 51 USPS codes), `US_STATES: readonly { code: UsState; name: string }[]` in alphabetical order by name, `isUsState(s: string): s is UsState`.
  - `AREAS: readonly { key: string; label: string; states: UsState[] }[]`. These are the BEA regions, using these exact keys, labels and states:
    - `new-england` "New England": CT ME MA NH RI VT
    - `mid-atlantic` "Mid-Atlantic": DE DC MD NJ NY PA
    - `great-lakes` "Great Lakes": IL IN MI OH WI
    - `plains` "Plains": IA KS MN MO NE ND SD
    - `southeast` "Southeast": AL AR FL GA KY LA MS NC SC TN VA WV
    - `southwest` "Southwest": AZ NM OK TX
    - `rocky-mountain` "Rocky Mountain": CO ID MT UT WY
    - `far-west` "West Coast, Alaska and Hawaii": AK CA HI NV OR WA
  - `toggleStates(selected: UsState[], group: UsState[]): UsState[]`. If every state in `group` is already selected, it removes them all. Otherwise it adds the missing ones. Output is deduped and sorted in `US_STATES` order.
  - `stateFromLocation(text: string): UsState | null`. It reads the part after the last comma, trimmed, and accepts a USPS code (any case) or a full state name (any case). Otherwise it returns null.
  - `COUNTRIES: readonly string[]`: ISO 3166-1 alpha-2 officially assigned codes, minus `US`, `PR`, `GU`, `VI`, `AS`, `MP`, `UM`. `countryName(code: string): string` uses `new Intl.DisplayNames(['en'], { type: 'region' })`.

- [ ] **Step 1: Write the failing tests**
  - `AREAS cover all 51 states exactly once`: flatten `AREAS.states`, sort, and expect it to equal the sorted `US_STATES` codes, length 51.
  - `toggleStates adds then removes a group`: `toggleStates(['GA'], ['GA','FL'])` → `['FL','GA']`, and `toggleStates(['FL','GA','TX'], ['GA','FL'])` → `['TX']`.
  - `stateFromLocation`: `'Atlanta, GA'`→`'GA'`, `'austin, texas'`→`'TX'`, `'Washington, D.C.'`→`null`, `'Washington, DC'`→`'DC'`, `'Toronto, ON'`→`null`, `''`→`null`, `'Georgia'`→`'GA'` (no comma means the whole string).
  - `COUNTRIES`: every code matches `/^[A-Z]{2}$/`, no duplicates, includes `CA`, `GB`, `IN`, excludes `US` and `PR`. `countryName('DE')` is `'Germany'`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/onboarding-regions.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/onboarding/regions.ts` per the interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(onboarding): US state, area and country vocabulary`.

---

### Task 2: School and major lookup tables, seeds and search

**Files:**
- Create: `supabase/migrations/20261108000500_lookups.sql`
- Create: `scripts/build-majors-seed.ts`, `scripts/build-schools-seed.ts`, `scripts/seed-sql.ts` (pure helpers)
- Create (generated, committed): `supabase/migrations/20261108000600_seed_majors.sql`, `supabase/migrations/20261108000700_seed_schools.sql`
- Modify: `src/lib/database.types.ts` (regenerated), `.env.example` (add commented `# SCORECARD_API_KEY=` with "local seed script only")
- Test: `tests/unit/seed-sql.test.ts`, `tests/integration/lookups.test.ts`

**Interfaces:**
- Produces (SQL):
  - `create extension if not exists pg_trgm with schema extensions;`
  - `public.schools` gains `unitid int unique`, `city text`, `alias text`, and `search_text text generated always as (lower(name || ' ' || coalesce(alias, '') || ' ' || coalesce(city, ''))) stored`, with a GIN `extensions.gin_trgm_ops` index on `search_text`. The migration first raises an exception if `schools` has rows with null `unitid`, so nothing is silently orphaned.
  - `public.majors(cip_code text primary key check (cip_code ~ '^\d{2}\.\d{4}$'), title text not null, family text not null)`, with a GIN trigram index on `lower(title)`. RLS on, `select` to `authenticated`, `revoke all ... from anon`, and no write grants (same pattern as `field_categories`, migrations `…0200`/`…0300`).
  - `public.search_schools(q text, lim int default 8) returns setof public.schools` and `public.search_majors(q text, lim int default 8) returns setof public.majors`. Both are `language sql stable security invoker set search_path = ''`.
    - Matching: every whitespace-separated word of `trim(q)` must match `search_text` (for majors, `lower(title)`) via `ilike all (array(...))`. Escape each word's `\`, `%` and `_` first.
    - Order: prefix match on name/title first, then `extensions.word_similarity(lower(q), …)` descending, then name/title.
    - `limit least(greatest(lim, 1), 20)`. Empty or blank `q` returns no rows.
    - `revoke execute ... from public, anon; grant execute ... to authenticated`.
  - Seeds use `insert ... on conflict (unitid|cip_code) do update`, in statements of at most 500 rows.
- Produces (TS, `scripts/seed-sql.ts`, pure):
  - `sqlText(s: string | null): string` (SQL literal with `'` doubled, or `null`).
  - `toMajorRows(csv: Record<string, string>[]): { cip_code: string; title: string; family: string }[]`. It strips Excel `="…"` wrappers from `CIPCode`/`CIPFamily` and keeps only codes matching `^\d{2}\.\d{4}$`. It drops these rows:
    - rows whose `Action` starts with `Deleted` or `Moved`
    - families `28`, `32`–`37`, `53`, `60`, `61`
    - codes ending in `99` (the "Other" entries)

    It also strips a trailing `.` and a trailing `, General` from titles and dedupes on lowercased title (first wins).
  - `toSchoolRows(results: ScorecardResult[]): { unitid: number; name: string; city: string | null; state: UsState; alias: string | null }[]`. It keeps only results whose `school.state` passes `isUsState`. Blank aliases become null.
  - `insertStatements(table: string, columns: string[], rows: Record<string, string | number | null>[], conflict: string, batch = 500): string`.
- Script behavior:
  - `build-majors-seed.ts <path-to-CIPCode2020.csv>`. Source: `https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv` (download it to the scratchpad and pass the path). It writes the `…0600` file with a header comment naming the source, retrieval date and "public domain (US Government work)".
  - `build-schools-seed.ts`:
    - Reads `SCORECARD_API_KEY` via `process.loadEnvFile('.env.local')`.
    - Fetches `https://api.data.gov/ed/collegescorecard/v1/schools` with `school.operating=1&school.degrees_awarded.highest__range=2..4&fields=id,school.name,school.city,school.state,school.alias&per_page=100&page=N`.
    - Fetches sequentially, about 1 request per second. On 429/5xx it retries with backoff up to 5 times, then exits non-zero. A failed page is never written as empty.
    - Writes the `…0700` file with the same kind of header.
  - Both scripts take the downloaded data as input only; they never `eval` it.

- [ ] **Step 1: Write failing unit tests** in `tests/unit/seed-sql.test.ts`:
  - `sqlText("O'Brien")` → `'O''Brien'`, and `sqlText(null)` → `null`.
  - `toMajorRows` keeps `="52.0203"` / "Logistics, Materials, and Supply Chain Management." as `52.0203` without the period. It drops `52.0299`, family `32`, and an `Action: "Deleted"` row. `"Economics, General."` becomes `"Economics"`.
  - `toSchoolRows` drops a `PR` result, maps `school.alias: ''` to null, and keeps `id` as `unitid`.
  - `insertStatements` with 1,001 rows and `batch=500` produces exactly 3 `insert` statements, each ending with the given `on conflict` clause.
- [ ] **Step 2: Run** `npx vitest run tests/unit/seed-sql.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `scripts/seed-sql.ts`, then the two scripts.
- [ ] **Step 4: Run** the unit tests. Expected: PASS.
- [ ] **Step 5: Write** `…0500_lookups.sql`. Then get the CSV and generate the majors seed: `npx tsx scripts/build-majors-seed.ts <scratchpad>/CIPCode2020.csv`.
- [ ] **Step 6: Ask the user** for a free api.data.gov key in `.env.local` as `SCORECARD_API_KEY` (they sign up; Claude must not). Then run `npx tsx scripts/build-schools-seed.ts`. Expected: the file is written, and the log shows the page count and between 3,000 and 7,000 rows. Spot-check that "Georgia Institute of Technology-Main Campus" is present.
- [ ] **Step 7: Push** with `npx supabase db push --linked --dry-run` (expect 3 migrations), then without `--dry-run`. Run `npm run db:types`.
- [ ] **Step 8: Write the integration tests** in `tests/integration/lookups.test.ts`, with one `createTestUser`:
  - `search_schools('georgia tech')` returns a row whose name starts with "Georgia Institute of Technology" in the first 3 results.
  - `search_schools('ohio state')` returns at most 8 rows, the first containing "Ohio State University".
  - `search_majors('supply chain')` includes `52.0203`.
  - `search_majors('econ')` puts a title starting "Economics" first.
  - `search_schools('%')`, `search_schools('_')` and `search_schools('  ')` return `[]` without error. `search_schools('x'.repeat(500))` returns `[]` without error.
  - Anon client: `rpc('search_schools', …)` errors (permission denied), and `from('majors').select()` returns no rows or an error.
  - User client: `from('majors').insert(...)` errors.
- [ ] **Step 9: Run** `npx vitest run tests/integration/lookups.test.ts`. Expected: PASS.
- [ ] **Step 10: Commit** the migrations, scripts, tests, types and `.env.example`, as `feat(db): school and major lookups seeded from College Scorecard and CIP 2020`.

---

### Task 3: Combobox and lookup actions

**Files:**
- Create: `src/app/(app)/onboarding/combobox.tsx` (client), `src/app/(app)/onboarding/lookup-actions.ts` (`'use server'`), `src/lib/onboarding/lookups.ts` (server-only)
- Test: `tests/unit/combobox-logic.test.ts` (pure reducer), with e2e coverage in Task 5

**Interfaces:**
- Consumes: `search_schools`, `search_majors` (Task 2).
- Produces:
  - `src/lib/onboarding/lookups.ts`:
    - `type SchoolHit = { id: string; name: string; city: string | null; state: string | null }`
    - `type MajorHit = { cip: string; title: string }`
    - `searchSchools(client: Client, q: string, limit?: number): Promise<SchoolHit[]>`
    - `searchMajors(client: Client, q: string, limit?: number): Promise<MajorHit[]>`
    - Both trim `q`, cap it at 100 chars, return `[]` under 2 chars, and throw on DB error.
  - `lookup-actions.ts`: `findSchools(q: string): Promise<ComboOption[]>` (label = name, detail = "City, ST") and `findMajors(q: string): Promise<ComboOption[]>` (label = title, `id` = CIP). Each calls `getCurrentUser()`. On DB error they log and return `[]`, so the user can still type free text.
  - `combobox.tsx`:
    - `type ComboOption = { id: string; label: string; detail?: string }`
    - `Combobox(props: { name: string; idName?: string; label: string; hint?: string; defaultText: string; defaultId: string; search: (q: string) => Promise<ComboOption[]>; allowFreeText: boolean; onPick?: (opt: ComboOption | null) => void; error?: string; badge?: string })`
    - Renders a text input `name` and, when `idName` is set, a hidden input `idName`.
  - Pure logic in the same file, exported for tests: `comboReducer(state: ComboState, action: ComboAction): ComboState`. Actions: `type` (sets text, clears id, opens), `results` (with a request seq; stale seqs are ignored), `move` (+1/−1, wraps, includes the free-text row), `pick`, `close`.
- Behavior:
  - ARIA 1.2 combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox with `role="option"`.
  - Debounce 150 ms, at least 2 characters, at most 8 results. Arrow keys move, Enter picks, Escape closes.
  - When `allowFreeText`, the last row is `Use "<typed text>"`, which picks free text (id `''`). Blurring without picking keeps the typed text with id `''`.
  - Uses the `.field` look and shows `FieldError` the same way as `TextField`.
  - The `badge` prop renders a small muted "from resume" tag next to the label (used in Task 9).

- [ ] **Step 1: Write failing tests** for `comboReducer`:
  - Typing clears a previously picked id.
  - Results with an older seq are ignored.
  - `move` wraps from the last row (the free-text row) to the first.
  - `pick` sets text and id and closes.
  - With `allowFreeText: false` there is no free-text row.
- [ ] **Step 2: Run** `npx vitest run tests/unit/combobox-logic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lookups.ts`, `lookup-actions.ts` and `combobox.tsx`.
- [ ] **Step 4: Run** the unit test (PASS), then `npm run lint && npm run typecheck`.
- [ ] **Step 5: Commit** `feat(onboarding): type-ahead combobox and lookup actions`.

---

### Task 4: Structured location columns and the step 1 schema (expand)

**Files:**
- Create: `supabase/migrations/20261108000800_profile_location.sql`
- Modify: `src/lib/onboarding/schema.ts`, `src/lib/onboarding/profile.ts`, `src/lib/database.types.ts`
- Test: `tests/unit/onboarding-schema.test.ts`, `tests/integration/onboarding-profile.test.ts`, `tests/integration/profile-location.test.ts`

**Interfaces:**
- Consumes: `UsState`, `US_STATES`, `isUsState`, `COUNTRIES` (Task 1).
- Produces (SQL):
  - `public.us_state_from_location(t text) returns text`, `immutable`, `set search_path = ''`. It is the SQL twin of `stateFromLocation` (the part after the last comma; a code or a full name from a `values` list of the 51; otherwise null). Execute is granted to `authenticated` and the owner only.
  - New `profiles` columns:
    - `school_id uuid references public.schools(id) on delete set null`
    - `major_cip text references public.majors(cip_code) on delete set null`
    - `home_state text`, `school_state text`, each with a check: null or in the 51 codes
    - `work_states text[] not null default '{}'`, check `work_states <@ array[...51 codes]` and `cardinality(work_states) <= 51`
    - `work_anywhere_us boolean not null default false`
    - `work_countries text[] not null default '{}'`, check `cardinality(work_countries) <= 20` and `not ('US' = any(work_countries))`
    - `open_to_remote boolean` (null = not answered yet)
  - Backfill, in this order:
    1. `home_state = us_state_from_location(home_location)` and `school_state = us_state_from_location(school_location)`.
    2. `relocate = 'anywhere'` → `work_anywhere_us = true`.
    3. `'within_region'` → `work_states` = the non-null of `home_state` and `school_state`, deduped.
    4. `'no'` → `work_states` = `array[home_state]` when not null.
  - Column grant: `grant update (school_id, major_cip, home_state, school_state, work_states, work_anywhere_us, work_countries, open_to_remote) on public.profiles to authenticated`. `relocate` stays for now (dropped in Task 6).
- Produces (TS):
  - `step1Schema` input fields:
    - `career_stage`, `school`, `school_id: string` (uuid or `''`), `major`, `major_cip: string` (`^\d{2}\.\d{4}$` or `''`)
    - `grad_date`, `work_auth`, `home_location`, `home_state: string` (code or `''`), `school_location`, `school_state: string`
    - `work_anywhere_us: boolean`, `work_states: string[]`, `work_countries: string[]`
    - `open_to_remote: boolean | null`
  - `in_state_school` and `relocate` are removed from the input.
  - Output type `Step1`:
    - `school_id: string | null`, `major_cip: string | null`, `home_state: UsState | null`, `school_state: UsState | null`
    - `work_states: UsState[]`, deduped and sorted in `US_STATES` order, and `[]` when `work_anywhere_us`
    - `work_countries: string[]`, deduped, every code in `COUNTRIES`, max 20
    - `open_to_remote: boolean`
    - `in_state_school: boolean | null` = `home_state === school_state` when both are set, else null. The in-state question is removed from the UI (decision recorded in Task 10).
  - Validation messages:
    - `open_to_remote` null → path `open_to_remote`, "Choose one".
    - No anywhere, no states, no countries and `open_to_remote === false` → path `work_states`, "Pick where you can work, or say you are open to remote work."
    - Unknown state code → "Choose one". Unknown or `US` country → path `work_countries`, "Pick countries from the list".
  - `applyStep1` writes all new columns. It no longer writes `relocate`.

- [ ] **Step 1: Update the unit tests** in `tests/unit/onboarding-schema.test.ts`. Replace the in-state tests and the old `step1` fixture with the new shape, then add:
  - `derives in_state_school from the two states`: GA/GA → true, GA/TN → false, GA/'' → null.
  - `anywhere clears specific states`: `{ work_anywhere_us: true, work_states: ['GA'] }` → `work_states: []`.
  - `needs somewhere to work`: no states, no countries, not anywhere and remote false fails at `['work_states']` with the message above. The same input with `open_to_remote: true` passes.
  - `rejects forged codes`: `work_states: ['ZZ']` fails, and `work_countries: ['US']` fails at `['work_countries']`.
  - `dedupes and orders states`: `['TX','GA','TX']` → `['GA','TX']`.
  - `open_to_remote is required`: null fails with "Choose one".
- [ ] **Step 2: Run** `npx vitest run tests/unit/onboarding-schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the `schema.ts` changes and the `applyStep1` write in `profile.ts`.
- [ ] **Step 4: Run** the unit tests. Expected: PASS.
- [ ] **Step 5: Write** `…0800_profile_location.sql`. Dry-run, read the output, push, then `npm run db:types`.
- [ ] **Step 6: Integration.**
  - Update `tests/integration/onboarding-profile.test.ts` fixtures to the new step 1 shape.
  - Add `step 1 stores structured locations`: it writes GA/TN states, `work_states: ['GA','TN']` and countries `['CA']`, and reads them back, including `in_state_school = false`.
  - New `tests/integration/profile-location.test.ts`, one user:
    - `rpc('us_state_from_location')` cases match the Task 1 unit cases.
    - The user cannot set `work_states` to `{ZZ}` or `work_countries` to `{US}` through a direct `update` (check violation).
    - The user cannot update `ai_mode` (still denied).
- [ ] **Step 7: Run** both integration files, one at a time. Expected: PASS.
- [ ] **Step 8: Commit** `feat(onboarding): structured work locations and remote preference (expand)`.

---

### Task 5: Step 1 form with comboboxes and "Where can you work?"

**Files:**
- Modify: `src/app/(app)/onboarding/step-one-form.tsx`, `src/app/(app)/onboarding/actions.ts`, `src/app/(app)/onboarding/data.ts`, `src/lib/onboarding/lookups.ts`
- Create: `src/app/(app)/onboarding/where-can-you-work.tsx` (client)
- Test: `tests/integration/onboarding-lookups.test.ts`, `tests/e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: `Combobox`, `findSchools`, `findMajors` (Task 3); `step1Schema`/`Step1` (Task 4); `US_STATES`, `AREAS`, `toggleStates`, `COUNTRIES`, `countryName` (Task 1).
- Produces:
  - `StepOneValues` drops `relocate`/`in_state_school` and gains these strings or arrays:
    - `school_id`, `major_cip`, `home_state`, `school_state`
    - `work_anywhere_us: boolean`, `work_states: string[]`, `work_countries: string[]`
    - `open_to_remote: boolean | null`
    - `stepOneValues()` maps them from the profile row.
  - `resolveStepOneLookups(client: Client, input: Step1): Promise<{ ok: true; value: Step1 } | { ok: false; errors: Record<string, string> }>` in `lookups.ts`.
    - A non-null `school_id` is looked up and `school` is replaced with the DB name. Unknown → `errors.school = 'Pick your school from the list again, or use what you typed.'`
    - `major_cip` works the same way (`errors.major`, the same wording with "major").
    - Never trust the client's label.
  - `saveStepOne` builds the input from FormData:
    - `work_states` via `formData.getAll('work_states')`
    - `work_countries` from a JSON hidden input
    - `work_anywhere_us` from the checkbox `'on'`
    - `open_to_remote` via the existing `yesNo`
    - It then runs `resolveStepOneLookups` before `saveStep1`.
- UI (copy is exact where quoted):
  - School and Major are `Combobox` with `allowFreeText`. Picking a school sets `school_location` to "City, ST" and `school_state` (the user can still edit both).
  - "Home city" `TextField` (`home_location`) next to a "Home state" `<select>`: blank "Choose…", the 51 states, then "Outside the US" (value `''`). "School state" is the same.
  - **"Where can you work?"** (`where-can-you-work.tsx`):
    - A row of toggle buttons (`aria-pressed`). "Home state (GA)" and "School state (TN)" appear only when the state is known. Then the 8 `AREAS` labels, then "Anywhere in the US". All except Anywhere use `toggleStates`.
    - Below the row, a `<details>` "Pick states" with 51 checkboxes `name="work_states"`. It is open when any state is selected.
    - When Anywhere is on, the state controls are disabled and show as all selected. The form posts `work_anywhere_us=on` and no states.
    - A summary line under the row: "11 states selected", "Anywhere in the US", or "None yet".
    - "Outside the US too?" is a multi-pick `Combobox` (`allowFreeText: false`) over `COUNTRIES` (client-side filter by `countryName`). Picked countries show as removable chips and are posted as JSON in `work_countries`.
  - **"Open to remote work?"** is a `ChoiceGroup` with Yes/No (`open_to_remote`).
  - The in-state question is gone.

- [ ] **Step 1: Write the failing integration test** `tests/integration/onboarding-lookups.test.ts`, one user:
  - `resolveStepOneLookups` with the real id of "Georgia Institute of Technology-Main Campus" (fetched in the test) and `school: 'whatever'` → ok, with `school` replaced by the DB name.
  - A random uuid → `{ ok: false, errors: { school: … } }`.
  - `major_cip: '52.0203'` → ok, with the DB title.
  - `major_cip: '99.9999'` → error on `major`.
  - `school_id: null`, `school: 'Universidad de Ejemplo'` → ok and unchanged.
- [ ] **Step 2: Run** it. Expected: FAIL. **Implement** `resolveStepOneLookups`. **Run** again. Expected: PASS.
- [ ] **Step 3: Update the e2e spec** `tests/e2e/onboarding.spec.ts`. In `fillStep1`:
  - Type "georgia tech" into School and pick the first option, so School location shows `Atlanta, GA`.
  - Type "Underwater Basket Studies" into Major, then pick `Use "Underwater Basket Studies"`.
  - Pick Home state "Ohio", then click "Southeast". Expect the summary to read "12 states selected" (Ohio is not added unless "Home state (OH)" is clicked).
  - Open to remote "No".
  - Drop the in-state step.

  New tests:
  - `anywhere in the US overrides states`: click "Southeast" then "Anywhere in the US", save, reload `/profile`, and expect "Anywhere in the US" pressed and no state checked.
  - `nothing picked and no remote shows the error`: expect the exact message from Task 4.
- [ ] **Step 4: Implement** the form, `where-can-you-work.tsx`, the `actions.ts` and `data.ts` changes.
- [ ] **Step 5: Run** `npm run lint && npm run typecheck && npx vitest run tests/unit && npm run test:e2e -- tests/e2e/onboarding.spec.ts`. Expected: all PASS. Also check 375px width and dark mode by screenshot in the browser pane.
- [ ] **Step 6: Commit** `feat(onboarding): school/major type-ahead and where-can-you-work picker`.

---

### Task 6: Drop the `relocate` enum (contract)

**Files:**
- Create: `supabase/migrations/20261108000900_drop_relocate.sql`
- Modify: `src/lib/onboarding/options.ts` (remove `RELOCATE`), `tests/unit/onboarding-options.test.ts`, `src/lib/database.types.ts`

**Interfaces:**
- Produces: `alter table public.profiles drop column relocate; drop type public.relocate_pref;` The column grant goes with the column. Note in a migration comment that no deployed code reads `relocate`: Phase 2 has not been deployed to production, and prod `main` (Phase 1) never wrote it.

- [ ] **Step 1:** `grep -rn "relocate\|RELOCATE\|within_region" src tests scripts`. Expected: only `options.ts`, its unit test and `database.types.ts`.
- [ ] **Step 2:** Remove `RELOCATE` and its test assertion. Write the migration. Dry-run, push, then `npm run db:types`.
- [ ] **Step 3:** Run the grep again (expected: no hits), then `npm run typecheck && npx vitest run tests/unit`. Expected: PASS.
- [ ] **Step 4: Commit** `refactor(db): drop relocate_pref after structured locations`.

---

### Task 7: Private resume bucket and suggestions column

**Files:**
- Create: `supabase/migrations/20261108001000_resume_storage.sql`, `src/lib/resume/paths.ts`
- Modify: `tests/integration/helpers.ts` (`deleteTestUser`), `tests/e2e/helpers.ts` (pool cleanup), `scripts/cleanup-test-users.ts`, `src/lib/database.types.ts`
- Test: `tests/unit/resume-paths.test.ts`, `tests/integration/resume-storage.test.ts`

**Interfaces:**
- Produces (SQL):
  - `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('resumes', 'resumes', false, 5242880, array['application/pdf']) on conflict (id) do nothing;`
  - Policies on `storage.objects` for `authenticated`: `select`, `insert` and `delete`, each `using`/`with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)`. No `update` policy (no overwrite).
  - `alter table public.resumes add column suggestions jsonb;` (RLS already owner-only).
- Produces (TS, pure `paths.ts`):
  - `RESUME_BUCKET = 'resumes'`
  - `RESUME_MAX_BYTES = 5 * 1024 * 1024`
  - `newResumePath(userId: string, id: string): string` → `${userId}/${id}.pdf`
  - `isOwnResumePath(userId: string, path: string): boolean`, which matches exactly `^<userId>/[0-9a-f-]{36}\.pdf$`
- Cleanup: `deleteTestUser` (integration), the e2e pool cleanup and `cleanup-test-users.ts` first list and remove every object under `resumes/<userId>/` with the admin client, and only then delete the user. They still touch only `@example.test` users.

- [ ] **Step 1: Write failing tests.**
  - Unit: `isOwnResumePath` accepts its own uuid path and rejects `../`, another user's folder, a `.PDF.exe` suffix and a nested folder.
  - Integration `resume-storage.test.ts`, users A and B:
    - A uploads a minimal `%PDF-1.4` byte string (`contentType: 'application/pdf'`) to `A/<uuid>.pdf`: ok.
    - A uploads to `B/<uuid>.pdf`: error.
    - B downloads A's object: error. B lists A's folder: empty.
    - An anon client downloads: error.
    - A uploads `text/plain`: error. A uploads 5 MB + 1 byte: error.
    - A inserts a `resumes` row with `suggestions` and B cannot select it.
    - After `deleteTestUser(A)`, an admin `list('A')` is empty.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `paths.ts`, the migration (dry-run, push, `db:types`) and the cleanup changes.
- [ ] **Step 4: Run** `npx vitest run tests/unit/resume-paths.test.ts tests/integration/resume-storage.test.ts`. Expected: PASS. Then `npx tsx scripts/cleanup-test-users.ts --dry-run` should list only `@example.test` users.
- [ ] **Step 5: Commit** `feat(resume): private resumes bucket with per-user RLS`.

---

### Task 8: Text extraction and the keyword resume reader

**Files:**
- Create: `src/lib/resume/types.ts`, `src/lib/resume/parse.ts`, `src/lib/resume/field-keywords.ts`, `src/lib/resume/extract.ts` (server-only), `src/lib/resume/reader.ts`, `src/lib/resume/keyword-reader.ts` (server-only), `src/lib/resume/process.ts` (server-only), `src/app/(app)/onboarding/resume-actions.ts` (`'use server'`), `tests/fixtures/resume-pdf.ts`
- Modify: `package.json` (`unpdf` dependency, `pdf-lib` devDependency); `next.config.ts` only if the build needs `serverExternalPackages: ['unpdf']`
- Test: `tests/unit/resume-parse.test.ts`, `tests/unit/resume-extract.test.ts`, `tests/integration/resume-process.test.ts`

**Interfaces:**
- Consumes: `searchSchools`, `searchMajors` (Task 3); `RESUME_BUCKET`, `RESUME_MAX_BYTES`, `isOwnResumePath` (Task 7); `stateFromLocation`, `UsState` (Task 1).
- Produces:
  - `types.ts`, a pure zod schema and type:
    ```ts
    type ResumeSuggestions = {
      version: 1;
      school: { id: string | null; name: string; city: string | null; state: UsState | null } | null;
      major: { cip: string | null; title: string } | null;
      grad_date: string | null;      // YYYY-MM
      home_location: string | null;  // as written, e.g. "Columbus, OH"
      home_state: UsState | null;
      fields: { slug: string; weight: 'primary' | 'secondary'; matched: string[] }[];
    };
    export const resumeSuggestionsSchema: z.ZodType<ResumeSuggestions>;
    ```
  - `parse.ts` (pure):
    - `findGradDate(text: string, today: Date): string | null`
      - Reads month-year forms ("May 2027", "Expected May 2027", "05/2027", "Spring 2027" → `2027-05`, "Fall 2027" → `2027-12`, "Class of 2027" → `2027-05`).
      - Only reads lines matching `/universit|college|institute|bachelor|master|associate|b\.?s\.?|b\.?a\.?|expected|graduat|class of/i`.
      - Returns the latest such date within `[today − 10y, today + 6y]`.
    - `findHomeLocation(text: string): { location: string; state: UsState } | null`
      - Searches the first 8 non-blank lines for `City, ST` or `City, Statename`.
      - Splits each line on `|`, `•` or `·` before matching.
    - `findSchoolPhrases(text: string): string[]`
      - Returns up to 3 lines or segments of at most 120 chars matching `/universit|college|institute|polytechnic|school of/i`.
      - Each one is cut at the first ` - `, ` – `, `|`, `,` + digit, or a month name.
    - `findMajorPhrases(text: string): string[]`
      - Captures after "Bachelor/Master/Associate of (Science|Arts|Business Administration|Engineering|Fine Arts) in", after "B.S./B.A./BBA/M.S. in", or after "Major:".
      - Cuts at `|`, `,`, ` - `, `Minor`, `GPA`, or the end of the line. Trims and drops captures under 3 chars.
    - `suggestFields(text: string, keywords: Record<string, string[]>, order: string[]): ResumeSuggestions['fields']`
      - A keyword counts once if it appears (case-insensitive, word boundaries, multi-word allowed).
      - Score = the number of distinct keywords matched.
      - Primary = the top slug if its score ≥ 3.
      - Secondary = up to 2 next slugs with a score ≥ 2 and ≥ half the primary score.
      - Ties go by `order` (the `field_categories.sort`).
      - If there is no primary, it returns `[]`.
  - `field-keywords.ts`: `FIELD_KEYWORDS: Record<string, string[]>` covering all 21 `field_categories` slugs.
    - 8–15 lowercase keywords each. No keyword in two slugs. Generic across majors (not tuned to the first user).
    - It must include these (the tests rely on them):
      - `supply-chain`: `supply chain`, `logistics`, `procurement`, `inventory`, `sourcing`, `warehouse`, `demand planning`, `lean`
      - `data-analysis`: `sql`, `tableau`, `power bi`, `excel`, `data analysis`, `dashboard`, `r`, `statistics`
      - `marketing`: `marketing`, `seo`, `social media`, `campaign`, `brand`, `content`, `google analytics`, `market research`
      - `software-engineering`: `java`, `javascript`, `typescript`, `react`, `git`, `api`, `software engineering`, `c++`
  - `extract.ts`: `extractPdfText(bytes: Uint8Array): Promise<ExtractResult>`, where:
    ```ts
    type ExtractResult =
      | { ok: true; text: string; pages: number }
      | { ok: false; reason: 'too_big' | 'not_pdf' | 'too_many_pages' | 'unreadable' | 'no_text' };
    ```
    - Bytes over `RESUME_MAX_BYTES` → `too_big`. Bytes not starting with `%PDF-` → `not_pdf`.
    - Uses `getDocumentProxy`. More than 10 pages → `too_many_pages`. A load error (including a password) → `unreadable`.
    - Otherwise `extractText(pdf, { mergePages: true })`. Under 50 non-space chars → `no_text`. Text is capped at 50,000 chars.
  - `reader.ts`:
    - `type ReaderContext = { client: Client; today: Date; categoryOrder: string[] }`
    - `type ResumeReader = (text: string, ctx: ReaderContext) => Promise<ResumeSuggestions>`
    - `export const resumeReader: ResumeReader = keywordResumeReader;`, preceded by `// LLM-UPGRADE: swap for an AnthropicProvider-backed reader (Haiku, server-only, monthly cap, gated by profiles.ai_mode) at the end of the build. Same input and output types.`
  - `keyword-reader.ts`: `keywordResumeReader: ResumeReader`.
    - School: for each phrase, take `searchSchools(phrase, 1)`. Accept it only if the hit's lowercased name (or its part before `-`) is contained in the lowercased phrase or vice versa. Otherwise `school = null` (no unmatched school prefill).
    - Major: `searchMajors(phrase, 1)`. Accept the same way. Otherwise `{ cip: null, title: phrase }`.
    - Mark `suggestFields` with `// LLM-UPGRADE: role/field inference is the main gain from the API.`
  - `process.ts`: `processResume(client: Client, userId: string, path: string, today?: Date): Promise<ProcessResult>`, where `ProcessResult = { ok: true; suggestions: ResumeSuggestions } | { ok: false; message: string }`.
    - Path not `isOwnResumePath` → `{ ok: false, message: 'Upload failed. Try again in a minute, or skip this step.' }`.
    - Downloads from `RESUME_BUCKET` with the user's client, then runs `extractPdfText` and `resumeReader`.
    - Inserts `resumes { kind: 'uploaded', storage_path: path, suggestions }`.
    - **Never writes `profiles`, `profile_fields` or `profile_industries`.**
    - Exact messages by reason:
      - `too_big`: "That file is over 5 MB. Upload a smaller PDF, or skip this step."
      - `not_pdf`: "That file isn't a PDF. Upload a PDF, or skip this step."
      - `too_many_pages`: "That PDF is over 10 pages. Upload just your resume, or skip this step."
      - `unreadable`: "We couldn't open that PDF. It may be password-protected. Try another file, or skip this step."
      - `no_text`: "We couldn't find any text in that PDF (it may be a scanned image). Skip this step and fill in your answers by hand."
  - `resume-actions.ts`: `readResume(path: string): Promise<ProcessResult>`. It calls `getCurrentUser()`, loads the category order, and calls `processResume` with the user's client. It logs and returns the generic upload message on a thrown error.
  - `tests/fixtures/resume-pdf.ts`: `makeResumePdf(lines: string[], opts?: { pages?: number; blank?: boolean }): Promise<Uint8Array>` (`blank` draws no text) using `pdf-lib`. Plus `FICTIONAL_RESUME_LINES`, a made-up person:
    - "Jordan Example | Columbus, OH | jordan@example.test"
    - "Georgia Institute of Technology – Atlanta, GA"
    - "Bachelor of Science in Industrial Engineering, Expected May 2027"
    - experience bullets that hit `supply chain`, `logistics`, `procurement`, `inventory`, `sql`, `tableau`, `excel`, `dashboard`

- [ ] **Step 1: Install** with `npm i unpdf` and `npm i -D pdf-lib`, after checking current APIs with Context7.
- [ ] **Step 2: Write failing unit tests** in `resume-parse.test.ts`, with `today = 2026-11-08`:
  - `findGradDate`:
    - The fixture gives `'2027-05'`.
    - `"Class of 2028"` gives `'2028-05'`.
    - A job line "Intern, June 2025 – Aug 2025" alone gives `null` (not an education line).
    - `"Expected May 2040"` gives `null` (out of range).
  - `findHomeLocation`: the fixture gives `{ location: 'Columbus, OH', state: 'OH' }`. A header with no location gives `null`.
  - `findMajorPhrases`: the fixture gives `['Industrial Engineering']`. `"B.A. in Economics | GPA 3.6"` gives `['Economics']`.
  - `findSchoolPhrases`: the fixture's first phrase is `'Georgia Institute of Technology'`.
  - `suggestFields` with `FIELD_KEYWORDS` on the fixture text gives exactly `[{ slug: 'supply-chain', weight: 'primary', … }, { slug: 'data-analysis', weight: 'secondary', … }]`. Text with only "excel" gives `[]`.
  - `FIELD_KEYWORDS` has exactly the 21 slugs, each with 8–15 entries, and no keyword in two slugs.
- [ ] **Step 3: Write failing unit tests** in `resume-extract.test.ts` (mock `server-only`):
  - The fixture PDF → ok, text contains "Industrial Engineering", `pages: 1`.
  - `new TextEncoder().encode('hello')` → `not_pdf`.
  - A PDF with no text drawn → `no_text`.
  - An 11-page fixture → `too_many_pages`.
  - `%PDF-` followed by garbage → `unreadable`.
  - A `Uint8Array(RESUME_MAX_BYTES + 1)` → `too_big`.
- [ ] **Step 4: Run** `npx vitest run tests/unit/resume-parse.test.ts tests/unit/resume-extract.test.ts`. Expected: FAIL. **Implement** `types`, `parse`, `field-keywords` and `extract`. **Run** again. Expected: PASS.
- [ ] **Step 5: Write the failing integration test** `tests/integration/resume-process.test.ts`, one user:
  - Upload the fixture to `newResumePath(user.id, randomUUID())` and call `processResume(user.client, user.id, path)`.
    - The suggestions school name starts with "Georgia Institute of Technology" with a non-null id and state `GA`.
    - The major title contains "Industrial Engineering".
    - `grad_date` is `'2027-05'` and `home_state` is `'OH'`.
    - Fields are supply-chain primary and data-analysis secondary.
    - A `resumes` row exists with those suggestions.
    - The `profiles` row is deep-equal to a snapshot taken before the call, and `profile_fields` is empty.
  - A path in another user's folder → `ok: false` and no new `resumes` row.
- [ ] **Step 6: Implement** `reader`, `keyword-reader`, `process` and `resume-actions`. **Run** the integration test. Expected: PASS. Then `npm run build` (if `unpdf` fails to bundle, add `serverExternalPackages: ['unpdf']` and rebuild). Expected: the build succeeds and `node scripts/check-bundle-secrets.mjs` passes.
- [ ] **Step 7: Commit** `feat(resume): PDF text extraction and keyword-based suggestions (no LLM)`.

---

### Task 9: Resume-first step and pre-filled forms

**Files:**
- Create: `src/app/(app)/onboarding/resume-step.tsx` (client), `src/app/(app)/onboarding/prefill.ts` (pure)
- Modify: `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/onboarding/data.ts`, `src/app/(app)/onboarding/form-parts.tsx` (`StepMarker`, `TextField` `badge` prop), `src/app/(app)/onboarding/step-one-form.tsx`, `src/app/(app)/onboarding/step-two-form.tsx`
- Test: `tests/unit/onboarding-prefill.test.ts`, `tests/e2e/onboarding-resume.spec.ts`, `tests/e2e/onboarding.spec.ts` (click "Skip for now" first)

**Interfaces:**
- Consumes: `readResume`, `ResumeSuggestions`, `resumeSuggestionsSchema` (Task 8); `newResumePath`, `RESUME_BUCKET`, `RESUME_MAX_BYTES` (Task 7); `createBrowserClient` (`src/lib/supabase/client.ts`).
- Produces:
  - `prefill.ts`:
    - `prefillStepOne(values: StepOneValues, s: ResumeSuggestions | null): { values: StepOneValues; fromResume: string[] }`
      - Fills only empty targets: `school` + `school_id` + `school_location` ("City, ST") + `school_state` from `s.school`; `major` + `major_cip`; `grad_date`; `home_location` + `home_state`.
      - `fromResume` lists the field names it filled.
    - `prefillStepTwo(values: StepTwoValues, s: ResumeSuggestions | null): { values: StepTwoValues; suggested: string[] }`
      - Only when `values.fields` is empty: sets the suggested category chips with their weights. `suggested` lists the slugs.
  - `data.ts`: `latestResumeSuggestions(): Promise<ResumeSuggestions | null>`.
    - Calls `getCurrentUser()`.
    - Reads the newest `resumes` row with `kind = 'uploaded'` and non-null `suggestions`.
    - Returns null if the row fails `resumeSuggestionsSchema`.
  - `page.tsx` routing:
    - `?step=resume` shows the resume step.
    - With no `step` param, `state.step === 0` and no uploaded resume, it also shows the resume step. Otherwise the existing rules apply.
    - Step 1/2 in onboarding mode apply the prefill. The profile page does **not**.
  - `StepMarker({ step: 0 | 1 | 2 })` shows three steps: "Resume (optional)", "Who you are", "What you want".
  - `STEPS[0] = { title: 'Start with your resume', intro: 'Optional. Pipeline reads it to fill in your answers and suggest the fields to search. You check everything before it is saved.' }`
  - `ResumeStep`:
    - A file input (accept `application/pdf`) with drag-and-drop. It checks type and size client-side with the same messages as Task 8.
    - Uploads with `createBrowserClient().storage.from(RESUME_BUCKET).upload(newResumePath(userId, crypto.randomUUID()), file, { contentType: 'application/pdf', upsert: false })`.
    - Then calls `readResume(path)`. On success it navigates to `/onboarding?step=1`; on failure it shows the message in `FormMessage`.
    - Shows "Reading your resume…" while pending.
    - A secondary "Skip for now" link goes to `/onboarding?step=1`.
    - `userId` is passed as a prop from the server page, which got it from `getCurrentUser()`.
  - Copy:
    - Step 1 banner (when `fromResume.length > 0`): "We filled in {n} answers from your resume. Check them before you continue."
    - Each pre-filled field shows the badge "from resume".
    - Step 2 banner (when `suggested.length > 0`): "Suggested from your resume: {Primary name} (primary){, Secondary name (secondary)…}. Change anything that's off."

- [ ] **Step 1: Write failing unit tests** in `onboarding-prefill.test.ts`:
  - Empty values plus full suggestions fill every step-1 target listed above, with `fromResume` naming them.
  - Values with `school: 'My College'` keep the school and its id/location/state untouched, but still fill `grad_date`.
  - `null` suggestions return the values unchanged with `fromResume: []`.
  - `prefillStepTwo` sets supply-chain primary and data-analysis secondary when `fields` is empty, and changes nothing when the user already has a field.
- [ ] **Step 2: Run** `npx vitest run tests/unit/onboarding-prefill.test.ts`. Expected: FAIL. **Implement** `prefill.ts`. **Run** again. Expected: PASS.
- [ ] **Step 3: Write the e2e spec** `tests/e2e/onboarding-resume.spec.ts`. Use one pool user, and write `makeResumePdf(FICTIONAL_RESUME_LINES)` to a temp file under `test-results/`.
  - A new user lands on "Start with your resume".
  - `setInputFiles` the fixture; it lands on step 1 with the banner "We filled in 7 answers from your resume". Use the exact n your fixture yields.
  - School shows "Georgia Institute of Technology…", Graduation month `2027-05` and Home state Ohio.
  - Fill the rest, continue. Step 2 shows the banner, with Supply Chain primary and Data Analysis secondary.
  - Save, then the dashboard. `/profile` shows the saved values.
  - A second test: a `.txt` renamed to `.pdf` shows "That file isn't a PDF…", and "Skip for now" reaches step 1 with no banner.
- [ ] **Step 4: Implement** `resume-step.tsx` and the page, data, `form-parts` and form changes.
- [ ] **Step 5: Run** `npm run lint && npm run typecheck && npx vitest run tests/unit && npm run test:e2e`. Expected: all PASS, and existing onboarding/dashboard specs still pass (the default route for a new user is now the resume step, so update `onboarding.spec.ts` to click "Skip for now" first). Screenshot the resume step at 375px in light and dark.
- [ ] **Step 6: Commit** `feat(onboarding): optional resume-first step with pre-filled answers`.

---

### Task 10: Docs and final verification

**Files:**
- Modify: `DECISIONS.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md`, `docs/superpowers/specs/2026-11-07-pipeline-design.md`, and the memory note `pipeline-build-status.md` (outside the repo)

- [ ] **Step 1: `DECISIONS.md`.** Change the "Phase 2b" heading to "built", and record:
  - BEA regions as the named areas (with "Mid-Atlantic" and "West Coast, Alaska and Hawaii" as labels).
  - 50 states + DC only; territories are a known gap.
  - `in_state_school` is derived from the two states and the question was removed.
  - Expand/contract for `relocate`.
  - The Scorecard key is a local, one-time seed input only.
  - Keyword reader rules (thresholds 3/2/half).
  - Suggestions live on `resumes.suggestions` and reach the profile only through form submit.
  - Unmatched school phrases are not pre-filled.
  - A **"LLM-UPGRADE points"** list: `src/lib/resume/reader.ts` (`resumeReader`), `keyword-reader.ts` (`suggestFields` call), and storing extracted text if the API reader needs it (re-extract from Storage for now).
  - Mark I3 resolved under "Phase 3 decisions (open)".
  - The follow-up: deleting a real account must also remove its Storage folder.
- [ ] **Step 2: `CLAUDE.md`** "Where things live": add `src/lib/onboarding/regions.ts`, `lookups.ts`, `src/lib/resume/` (pure `parse.ts`/`types.ts`/`field-keywords.ts`, server-only `extract.ts`/`keyword-reader.ts`/`process.ts`), and the seed generators `scripts/build-schools-seed.ts` / `scripts/build-majors-seed.ts`, with how to rerun them.
- [ ] **Step 3: `THIRD_PARTY_NOTICES.md`:**
  - College Scorecard (US Dept. of Education, public domain, with the retrieval date)
  - CIP 2020 (NCES, public domain)
  - `unpdf` (MIT), which bundles PDF.js (Apache-2.0)
  - `pdf-lib` (MIT, dev only)
- [ ] **Step 4: Spec** §3.2: add the optional resume step 0, and replace "willingness to relocate" with "states they can work in (or anywhere in the US), other countries, and open to remote". In §5 `profiles`, replace "relocate" with the new columns.
- [ ] **Step 5: Verify.**
  - `grep -ri anthropic src package.json` gives no output.
  - `npm run lint && npm run typecheck && npx vitest run tests/unit && npm run build && node scripts/check-bundle-secrets.mjs` all pass.
  - Run each integration file once, individually: all pass.
  - `npm run test:e2e`: all pass.
  - `npx tsx scripts/cleanup-test-users.ts --dry-run` lists no leftovers.
- [ ] **Step 6: Commit** `docs: Phase 2b decisions, notices and spec updates`. Push the branch, then tell the user it is ready for them to open or review the PR and deploy.
